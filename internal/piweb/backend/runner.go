package backend

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const fallbackChoiceSystemPrompt = `Pi Web UI fallback choice protocol:
- You are running inside Pi Web UI.
- When you need the user to choose between options, or the user asks you to ask a choice question,
  output a fenced json block with top-level type "piweb_choice".
- Stop after emitting the fallback block and wait for the user's follow-up.
- When the user later sends:
  선택지 응답:
  id: <id>
  value: <value>
  continue using that id/value as the selected answer.
- Required schema:
  {
    "type":"piweb_choice",
    "id":"stable-choice-id",
    "question":"Question text",
    "options":[{"label":"Option A","value":"A","description":"What A means"}],
    "allowCustom":false
  }
- Keep id stable, short, and unique. Use at most 8 options. Use inert plain text only.`

type Runner struct {
	mu      sync.Mutex
	running map[string]*activePiRun
}

type activePiRun struct {
	cancel context.CancelFunc
	stdin  io.WriteCloser
	mu     sync.Mutex
}

func NewRunner() *Runner {
	return &Runner{running: map[string]*activePiRun{}}
}
func (r *Runner) StartPiPrompt(
	parent context.Context,
	events EventSink,
	store SessionMessageStore,
	sessionID string,
	text string,
	images []PromptAttachment,
	displayText string,
) error {
	sessionFile, cwd, ok := store.SessionRuntime(sessionID)
	if !ok {
		return ErrNotFound
	}
	ctx, cancel := context.WithCancel(parent)
	cmd := exec.CommandContext(ctx, "pi", piRPCArgs(sessionFile)...)
	cmd.Dir = cwd
	configureCommandProcessGroup(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return err
	}
	stderr, _ := cmd.StderrPipe()

	activeRun := &activePiRun{cancel: cancel, stdin: stdin}
	r.mu.Lock()
	if _, exists := r.running[sessionID]; exists {
		r.mu.Unlock()
		cancel()
		return errors.New("session already running")
	}
	r.running[sessionID] = activeRun
	r.mu.Unlock()

	if err := cmd.Start(); err != nil {
		r.forgetRun(sessionID, activeRun)
		cancel()
		return err
	}
	if err := activeRun.send(rpcPromptCommand(text, images, "")); err != nil {
		r.forgetRun(sessionID, activeRun)
		cancel()
		return err
	}

	go func() {
		defer func() {
			r.forgetRun(sessionID, activeRun)
			cancel()
		}()
		user := Message{Kind: "user", Text: displayText, Attachments: images}
		_ = store.AppendMessage(sessionID, user)
		events.Publish(sessionID, "session.message", user)
		events.Publish(sessionID, "session.status", map[string]string{"status": "running"})

		go func() {
			<-ctx.Done()
			terminateCommandProcessGroup(cmd)
		}()

		state := &jsonStreamState{
			onFallbackChoiceMessage: func() {
				if session, messages, err := store.Session(sessionID); err == nil {
					_ = notifyRemoteChoiceQuestion(cwd, session, messages)
				}
			},
		}
		stdoutDone := make(chan struct{})
		agentDone := make(chan struct{})
		var doneOnce sync.Once
		go streamPipe(stdout, func(line string) {
			if isPiRPCAgentEnd(line) {
				doneOnce.Do(func() { close(agentDone) })
			}
			if !handlePiJSONEvent(line, events, store, sessionID, state) {
				events.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
			}
		}, stdoutDone)
		go streamPipe(stderr, func(line string) {
			events.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
		}, nil)

		select {
		case <-agentDone:
			_ = stdin.Close()
		case <-ctx.Done():
		case <-stdoutDone:
		}
		err := cmd.Wait()
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			events.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			events.Publish(sessionID, "session.status", map[string]string{"status": "idle"})
			return
		}
		if state.assistantResponseCompleted && !state.fallbackChoiceNotified {
			if session, messages, err := store.Session(sessionID); err == nil {
				go func() {
					_ = notifyRemoteResponseCompletedForFile(cwd, sessionFile, session, messages)
				}()
			}
		}
		events.Publish(sessionID, "session.status", map[string]string{
			"status":     "idle",
			"finishedAt": time.Now().UTC().Format(time.RFC3339),
		})
	}()
	return nil
}

func (r *Runner) Steer(sessionID string, text string, images []PromptAttachment) error {
	r.mu.Lock()
	run, ok := r.running[sessionID]
	r.mu.Unlock()
	if !ok {
		return errors.New("session is not running")
	}
	return run.send(rpcPromptCommand(text, images, "steer"))
}

func (r *Runner) IsRunning(sessionID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.running[sessionID]
	return ok
}

func (r *Runner) RunningSessionIDs() map[string]bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	running := make(map[string]bool, len(r.running))
	for sessionID := range r.running {
		running[sessionID] = true
	}
	return running
}

func (r *Runner) forgetRun(sessionID string, run *activePiRun) {
	r.mu.Lock()
	if r.running[sessionID] == run {
		delete(r.running, sessionID)
	}
	r.mu.Unlock()
}

func piRPCArgs(sessionFile string) []string {
	return []string{
		"--session", sessionFile,
		"--mode", "rpc",
		"--append-system-prompt", fallbackChoiceSystemPrompt,
	}
}

type rpcPrompt struct {
	Type              string     `json:"type"`
	Message           string     `json:"message"`
	Images            []rpcImage `json:"images,omitempty"`
	StreamingBehavior string     `json:"streamingBehavior,omitempty"`
}

type rpcImage struct {
	Type     string `json:"type"`
	Data     string `json:"data"`
	MIMEType string `json:"mimeType"`
}

func rpcPromptCommand(text string, images []PromptAttachment, streamingBehavior string) rpcPrompt {
	return rpcPrompt{Type: "prompt", Message: text, Images: rpcImages(images), StreamingBehavior: streamingBehavior}
}

func rpcImages(images []PromptAttachment) []rpcImage {
	result := make([]rpcImage, 0, len(images))
	for _, image := range images {
		data := strings.TrimSpace(image.DataURL)
		if data == "" {
			continue
		}
		if comma := strings.Index(data, ","); comma >= 0 {
			data = data[comma+1:]
		}
		mimeType := image.MIMEType
		if mimeType == "" {
			mimeType = "image/png"
		}
		result = append(result, rpcImage{Type: "image", Data: data, MIMEType: mimeType})
	}
	return result
}

func (r *activePiRun) send(command any) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	line, err := json.Marshal(command)
	if err != nil {
		return err
	}
	line = append(line, '\n')
	_, err = r.stdin.Write(line)
	return err
}

func isPiRPCAgentEnd(line string) bool {
	var event struct {
		Type string `json:"type"`
	}
	return json.Unmarshal([]byte(line), &event) == nil && event.Type == "agent_end"
}

func imageExtension(mimeType string) string {
	subtype := strings.TrimPrefix(strings.ToLower(mimeType), "image/")
	subtype = strings.Split(subtype, ";")[0]
	switch subtype {
	case "jpeg":
		return ".jpg"
	case "png", "gif", "webp", "bmp":
		return "." + subtype
	case "svg+xml":
		return ".svg"
	default:
		return ".png"
	}
}

func (r *Runner) Cancel(sessionID string) bool {
	r.mu.Lock()
	run, ok := r.running[sessionID]
	if ok {
		delete(r.running, sessionID)
	}
	r.mu.Unlock()
	if ok {
		run.cancel()
	}
	return ok
}
