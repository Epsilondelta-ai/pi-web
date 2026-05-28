package piweb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

const maxEmptyAssistantRetries = 3

const emptyAssistantRetryError = "Pi finished without an assistant message after 3 automatic retries. Please retry or continue manually."

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
	broker *Broker,
	store *Store,
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
		broker.Publish(sessionID, "session.message", user)
		broker.Publish(sessionID, "session.status", map[string]string{"status": "running"})

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
		agentDone := make(chan struct{}, maxEmptyAssistantRetries+1)
		go streamPipe(stdout, func(line string) {
			if isPiRPCAgentEnd(line) {
				select {
				case agentDone <- struct{}{}:
				default:
				}
			}
			if !handlePiJSONEvent(line, broker, store, sessionID, state) {
				broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
			}
		}, stdoutDone)
		go streamPipe(stderr, func(line string) {
			broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
		}, nil)

		emptyAssistantFailed := false
		for {
			select {
			case <-agentDone:
				if state.assistantTurnSucceeded() {
					_ = stdin.Close()
					goto waitForProcess
				}
				if state.emptyAssistantRetries >= maxEmptyAssistantRetries {
					emptyAssistantFailed = true
					broker.Publish(sessionID, "error", map[string]string{"error": emptyAssistantRetryError})
					_ = stdin.Close()
					goto waitForProcess
				}
				state.emptyAssistantRetries++
				broker.Publish(sessionID, "session.status", map[string]string{
					"status": "running",
					"detail": fmt.Sprintf("empty assistant response; retrying %d/%d", state.emptyAssistantRetries, maxEmptyAssistantRetries),
				})
				state.resetAssistantTurn()
				if err := activeRun.send(rpcPromptCommand(emptyAssistantRecoveryPrompt(text), images, "")); err != nil {
					emptyAssistantFailed = true
					broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
					_ = stdin.Close()
					goto waitForProcess
				}
			case <-ctx.Done():
				goto waitForProcess
			case <-stdoutDone:
				goto waitForProcess
			}
		}

	waitForProcess:
		err := cmd.Wait()
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			broker.Publish(sessionID, "session.status", map[string]string{"status": "idle"})
			return
		}
		if state.assistantResponseCompleted && !state.fallbackChoiceNotified && !emptyAssistantFailed {
			if session, messages, err := store.Session(sessionID); err == nil {
				go func() {
					_ = notifyRemoteResponseCompletedForFile(cwd, sessionFile, session, messages)
				}()
			}
		}
		broker.Publish(sessionID, "session.status", map[string]string{
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

func emptyAssistantRecoveryPrompt(originalPrompt string) string {
	return strings.TrimSpace(`The previous turn ended without any assistant message.
This is not a successful completion.
Continue from the last valid session/tool state and complete the original request.
Do not restart work that is already complete unless it is necessary.

Original request:
` + originalPrompt)
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
