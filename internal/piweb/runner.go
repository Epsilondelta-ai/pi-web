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
const llmIdleRetryError = "Pi did not receive any LLM response or event before the idle timeout after 3 automatic retries. Please retry manually."
const piWebRecoveryPromptPrefix = "The previous turn ended or stalled without a completed assistant message."
const retryMarkerPrefix = "Automatic retry marker:"

var firstLLMEventIdleTimeout = 90 * time.Second
var streamLLMEventIdleTimeout = 120 * time.Second

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
	activeRun := &activePiRun{cancel: cancel}
	r.mu.Lock()
	if _, exists := r.running[sessionID]; exists {
		r.mu.Unlock()
		cancel()
		return errors.New("session already running")
	}
	r.running[sessionID] = activeRun
	r.mu.Unlock()

	go func() {
		defer func() {
			r.forgetRun(sessionID, activeRun)
			cancel()
		}()
		user := Message{Kind: "user", Text: displayText, Attachments: images}
		_ = store.AppendMessage(sessionID, user)
		broker.Publish(sessionID, "session.message", user)
		broker.Publish(sessionID, "session.status", map[string]string{"status": "running"})

		state := &jsonStreamState{
			onFallbackChoiceMessage: func() {
				if session, messages, err := store.Session(sessionID); err == nil {
					_ = notifyRemoteChoiceQuestion(cwd, session, messages)
				}
			},
		}
		promptText := text
		for {
			result, err := r.runPiAttempt(ctx, activeRun, broker, store, sessionID, sessionFile, cwd, promptText, images, state)
			if ctx.Err() != nil {
				return
			}
			if result.success {
				if state.assistantResponseCompleted && !state.fallbackChoiceNotified {
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
				return
			}
			if result.retry {
				promptText = emptyAssistantRecoveryPrompt(text)
				continue
			}
			if err != nil && !result.errorPublished {
				broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			}
			broker.Publish(sessionID, "session.status", map[string]string{"status": "idle"})
			return
		}
	}()
	return nil
}

type piAttemptResult struct {
	success        bool
	retry          bool
	errorPublished bool
}

func (r *Runner) runPiAttempt(
	ctx context.Context,
	activeRun *activePiRun,
	broker *Broker,
	store *Store,
	sessionID string,
	sessionFile string,
	cwd string,
	promptText string,
	images []PromptAttachment,
	state *jsonStreamState,
) (piAttemptResult, error) {
	attemptCtx, attemptCancel := context.WithCancel(ctx)
	defer attemptCancel()
	cmd := exec.CommandContext(attemptCtx, "pi", piRPCArgs(sessionFile)...)
	cmd.Dir = cwd
	configureCommandProcessGroup(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return piAttemptResult{}, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return piAttemptResult{}, err
	}
	stderr, _ := cmd.StderrPipe()
	activeRun.setStdin(stdin)
	if err := cmd.Start(); err != nil {
		return piAttemptResult{}, err
	}
	go func() {
		<-attemptCtx.Done()
		terminateCommandProcessGroup(cmd)
	}()
	if err := activeRun.send(rpcPromptCommand(promptText, images, "")); err != nil {
		attemptCancel()
		_ = cmd.Wait()
		return piAttemptResult{}, err
	}

	stdoutDone := make(chan struct{})
	agentDone := make(chan struct{}, 1)
	activity := make(chan struct{}, 1)
	noteActivity := func() {
		select {
		case activity <- struct{}{}:
		default:
		}
	}
	go streamPipe(stdout, func(line string) {
		noteActivity()
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
		noteActivity()
		broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
	}, nil)

	result := r.waitForPiAttempt(ctx, attemptCancel, broker, store, sessionID, state, agentDone, stdoutDone, activity)
	if result.success || result.retry || result.errorPublished {
		_ = stdin.Close()
	}
	activeRun.clearStdin(stdin)
	err = cmd.Wait()
	if result.retry || result.errorPublished {
		return result, nil
	}
	return result, err
}

func (r *Runner) waitForPiAttempt(
	ctx context.Context,
	attemptCancel context.CancelFunc,
	broker *Broker,
	store *Store,
	sessionID string,
	state *jsonStreamState,
	agentDone <-chan struct{},
	stdoutDone <-chan struct{},
	activity <-chan struct{},
) piAttemptResult {
	timer := time.NewTimer(firstLLMEventIdleTimeout)
	defer timer.Stop()
	resetTimer := func(timeout time.Duration) {
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(timeout)
	}
	for {
		select {
		case <-agentDone:
			if state.assistantTurnSucceeded() {
				return piAttemptResult{success: true}
			}
			resetTimer(streamLLMEventIdleTimeout)
		case <-stdoutDone:
			if state.assistantTurnSucceeded() {
				return piAttemptResult{success: true}
			}
			return retryEmptyAssistantTurn(broker, store, sessionID, state)
		case <-activity:
			resetTimer(streamLLMEventIdleTimeout)
		case <-timer.C:
			if state.assistantTurnSucceeded() {
				attemptCancel()
				return piAttemptResult{success: true}
			}
			attemptCancel()
			return retryIdleTimeoutTurn(broker, store, sessionID, state)
		case <-ctx.Done():
			return piAttemptResult{}
		}
	}
}

func retryEmptyAssistantTurn(broker *Broker, store *Store, sessionID string, state *jsonStreamState) piAttemptResult {
	if state.emptyAssistantRetries >= maxEmptyAssistantRetries {
		publishRetryNotice(broker, store, sessionID, "empty assistant", maxEmptyAssistantRetries, maxEmptyAssistantRetries, "failed")
		broker.Publish(sessionID, "error", map[string]string{"error": emptyAssistantRetryError})
		return piAttemptResult{errorPublished: true}
	}
	state.emptyAssistantRetries++
	publishRetryNotice(broker, store, sessionID, "empty assistant", state.emptyAssistantRetries, maxEmptyAssistantRetries, "retrying")
	broker.Publish(sessionID, "session.status", map[string]string{
		"status": "running",
		"detail": fmt.Sprintf("empty assistant response; retrying %d/%d", state.emptyAssistantRetries, maxEmptyAssistantRetries),
	})
	state.resetAssistantTurn()
	return piAttemptResult{retry: true}
}

func retryIdleTimeoutTurn(broker *Broker, store *Store, sessionID string, state *jsonStreamState) piAttemptResult {
	if state.idleTimeoutRetries >= maxEmptyAssistantRetries {
		publishRetryNotice(broker, store, sessionID, "LLM idle timeout", maxEmptyAssistantRetries, maxEmptyAssistantRetries, "failed")
		broker.Publish(sessionID, "error", map[string]string{"error": llmIdleRetryError})
		return piAttemptResult{errorPublished: true}
	}
	state.idleTimeoutRetries++
	publishRetryNotice(broker, store, sessionID, "LLM idle timeout", state.idleTimeoutRetries, maxEmptyAssistantRetries, "retrying")
	broker.Publish(sessionID, "session.status", map[string]string{
		"status": "running",
		"detail": fmt.Sprintf("LLM idle timeout; retrying %d/%d", state.idleTimeoutRetries, maxEmptyAssistantRetries),
	})
	state.resetAssistantTurn()
	return piAttemptResult{retry: true}
}

func publishRetryNotice(broker *Broker, store *Store, sessionID string, reason string, attempt int, max int, status string) {
	messageStatus := "retry"
	if status == "failed" {
		messageStatus = "err"
	}
	msg := Message{
		Kind:               "tool",
		Tool:               "pi",
		Status:             messageStatus,
		ResultMeta:         fmt.Sprintf("%s %d/%d", status, attempt, max),
		Body:               fmt.Sprintf("%s %s (%s %d/%d).", retryMarkerPrefix, reason, status, attempt, max),
		CollapsedByDefault: false,
	}
	_ = store.AppendMessage(sessionID, msg)
	_ = store.AppendSessionRetryNotice(sessionID, msg)
	broker.Publish(sessionID, eventTypeForMessage(msg), msg)
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
	return strings.TrimSpace(piWebRecoveryPromptPrefix + `
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

func (r *activePiRun) setStdin(stdin io.WriteCloser) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stdin = stdin
}

func (r *activePiRun) clearStdin(stdin io.WriteCloser) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stdin == stdin {
		r.stdin = nil
	}
}

func (r *activePiRun) send(command any) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stdin == nil {
		return errors.New("session is not accepting input")
	}
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
