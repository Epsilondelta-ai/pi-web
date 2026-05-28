package piweb

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStreamPipeHandlesLargeJSONLines(t *testing.T) {
	line := strings.Repeat("x", 1024*1024+1)
	done := make(chan struct{})
	var got string

	go streamPipe(strings.NewReader(line+"\n"), func(value string) {
		got = value
	}, done)
	<-done

	if got != line {
		t.Fatalf("expected large line to pass through, got %d bytes", len(got))
	}
}

func TestHandlePiJSONEventIgnoresToolCallDeltaAsText(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	ok := handlePiJSONEvent(`{"type":"message_update","assistantMessageEvent":{"type":"toolcall_delta","delta":"{\"command\":\"pwd\"}"}}`, broker, store, "8e7c-44ff", state)
	if !ok {
		t.Fatal("expected json event to be handled")
	}
	if replay := broker.Replay("8e7c-44ff", 0); len(replay) != 0 {
		t.Fatalf("toolcall delta should not be published as chat text: %#v", replay)
	}
}

func TestHandlePiJSONEventStreamsTextDelta(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	handlePiJSONEvent(`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hello"}}`, broker, store, "8e7c-44ff", state)
	replay := broker.Replay("8e7c-44ff", 0)
	if len(replay) != 1 || replay[0].Type != "session.delta" {
		t.Fatalf("expected text delta event: %#v", replay)
	}
}

func TestHandlePiJSONEventPublishesFinalFallbackChoiceAfterStreaming(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	called := 0
	state := &jsonStreamState{onFallbackChoiceMessage: func() { called++ }}
	choice := "```json\n{\"type\":\"piweb_choice\",\"id\":\"test\",\"question\":\"Pick?\",\"options\":[{\"label\":\"A\",\"value\":\"a\"}],\"allowCustom\":false}\n```"
	encoded, _ := json.Marshal(choice)
	handlePiJSONEvent(`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":`+string(encoded)+`}}`, broker, store, "8e7c-44ff", state)
	handlePiJSONEvent(`{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":`+string(encoded)+`}]}}`, broker, store, "8e7c-44ff", state)
	replay := broker.Replay("8e7c-44ff", 0)
	if len(replay) != 2 || replay[0].Type != "session.delta" || replay[1].Type != "session.message" {
		t.Fatalf("expected final fallback choice message after delta: %#v", replay)
	}
	if called != 1 {
		t.Fatalf("expected fallback choice notification callback once, got %d", called)
	}
}

func TestHandlePiJSONEventTracksCompletedAssistantResponse(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	handlePiJSONEvent(`{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}`, broker, store, "8e7c-44ff", state)
	if !state.assistantResponseCompleted {
		t.Fatal("expected final assistant text to mark response completed")
	}
}

func TestHandlePiJSONEventDoesNotCompleteToolOnlyAssistantMessage(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	handlePiJSONEvent(`{"type":"message_end","message":{"role":"assistant","content":[{"type":"toolCall","name":"bash","arguments":{"command":"pwd"}}]}}`, broker, store, "8e7c-44ff", state)
	if state.assistantResponseCompleted {
		t.Fatal("tool-only assistant placeholder should not mark response completed")
	}
}

func TestHandlePiJSONEventSkipsFinalToolCallPlaceholders(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	handlePiJSONEvent(`{"type":"message_end","message":{"role":"assistant","content":[{"type":"toolCall","name":"bash","arguments":{"command":"pwd"}}]}}`, broker, store, "8e7c-44ff", state)
	if replay := broker.Replay("8e7c-44ff", 0); len(replay) != 0 {
		t.Fatalf("assistant tool call placeholders should not be replayed as running tools: %#v", replay)
	}
	_, messages, _ := store.Session("8e7c-44ff")
	if len(messages) != 5 {
		t.Fatalf("assistant tool call placeholders should not be stored: %#v", messages)
	}
}

func TestStartPiPromptRetriesEmptyAssistantUntilMessageArrives(t *testing.T) {
	logPath := installFakePi(t, `#!/bin/sh
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$PI_FAKE_LOG"
  count=$(wc -l < "$PI_FAKE_LOG")
  if [ "$count" -lt 4 ]; then
    printf '%s\n' '{"type":"agent_end"}'
  else
    printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}'
    printf '%s\n' '{"type":"agent_end"}'
  fi
done
`)
	store := runnerTestStore(t)
	broker := NewBroker()
	runner := NewRunner()

	if err := runner.StartPiPrompt(context.Background(), broker, store, "s1", "fix it", nil, "fix it"); err != nil {
		t.Fatalf("StartPiPrompt failed: %v", err)
	}
	waitForRunnerIdle(t, runner, "s1")

	lines := readPromptLog(t, logPath)
	if len(lines) != 4 {
		t.Fatalf("expected original prompt plus 3 retries, got %d: %#v", len(lines), lines)
	}
	if !strings.Contains(lines[1], "The previous turn ended or stalled without a completed assistant message.") {
		t.Fatalf("retry prompt should explain empty assistant recovery in English: %s", lines[1])
	}
	if !strings.Contains(lines[1], "Original request:\\nfix it") {
		t.Fatalf("retry prompt should include original request: %s", lines[1])
	}
	_, messages, err := store.Session("s1")
	if err != nil {
		t.Fatalf("Session failed: %v", err)
	}
	if countRetryMarkers(messages, "empty assistant") != 3 {
		t.Fatalf("expected 3 saved empty assistant retry markers, got %#v", messages)
	}
	assertSessionFileRetryMarkers(t, store, 3)
	if got := messages[len(messages)-1]; got.Kind != "pi" || got.Text != "done" {
		t.Fatalf("expected final assistant message after retry, got %#v", got)
	}
	for _, event := range broker.Replay("s1", 0) {
		if event.Type == "error" {
			t.Fatalf("successful retry should not publish error: %#v", event)
		}
	}
}

func TestStartPiPromptDoesNotRetryCompletedAssistantWhenAgentEndIsDelayed(t *testing.T) {
	overrideLLMIdleTimeouts(t, 30*time.Millisecond, 30*time.Millisecond)
	logPath := installFakePi(t, `#!/bin/sh
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$PI_FAKE_LOG"
  printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}'
  sleep 10
done
`)
	store := runnerTestStore(t)
	broker := NewBroker()
	runner := NewRunner()

	if err := runner.StartPiPrompt(context.Background(), broker, store, "s1", "fix it", nil, "fix it"); err != nil {
		t.Fatalf("StartPiPrompt failed: %v", err)
	}
	waitForRunnerIdle(t, runner, "s1")

	if lines := readPromptLog(t, logPath); len(lines) != 1 {
		t.Fatalf("completed assistant must not be retried when agent_end is delayed, got %d prompts: %#v", len(lines), lines)
	}
	_, messages, err := store.Session("s1")
	if err != nil {
		t.Fatalf("Session failed: %v", err)
	}
	if countRetryMarkers(messages, "LLM idle timeout") != 0 {
		t.Fatalf("completed assistant should not save idle retry markers, got %#v", messages)
	}
	if got := messages[len(messages)-1]; got.Kind != "pi" || got.Text != "done" {
		t.Fatalf("expected completed assistant message, got %#v", got)
	}
}

func TestStartPiPromptRetriesIdleTimeoutUntilMessageArrives(t *testing.T) {
	overrideLLMIdleTimeouts(t, 30*time.Millisecond, 30*time.Millisecond)
	logPath := installFakePi(t, `#!/bin/sh
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$PI_FAKE_LOG"
  count=$(wc -l < "$PI_FAKE_LOG")
  if [ "$count" -lt 4 ]; then
    sleep 10
  else
    printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}'
    printf '%s\n' '{"type":"agent_end"}'
  fi
done
`)
	store := runnerTestStore(t)
	broker := NewBroker()
	runner := NewRunner()

	if err := runner.StartPiPrompt(context.Background(), broker, store, "s1", "fix it", nil, "fix it"); err != nil {
		t.Fatalf("StartPiPrompt failed: %v", err)
	}
	waitForRunnerIdle(t, runner, "s1")

	if lines := readPromptLog(t, logPath); len(lines) != 4 {
		t.Fatalf("expected original prompt plus 3 idle retries, got %d: %#v", len(lines), lines)
	}
	_, messages, err := store.Session("s1")
	if err != nil {
		t.Fatalf("Session failed: %v", err)
	}
	if countRetryMarkers(messages, "LLM idle timeout") != 3 {
		t.Fatalf("expected 3 saved idle timeout retry markers, got %#v", messages)
	}
	if got := messages[len(messages)-1]; got.Kind != "pi" || got.Text != "done" {
		t.Fatalf("expected final assistant message after idle retry, got %#v", got)
	}
}

func TestStartPiPromptFailsAfterThreeEmptyAssistantRetries(t *testing.T) {
	logPath := installFakePi(t, `#!/bin/sh
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$PI_FAKE_LOG"
  printf '%s\n' '{"type":"agent_end"}'
done
`)
	store := runnerTestStore(t)
	broker := NewBroker()
	runner := NewRunner()

	if err := runner.StartPiPrompt(context.Background(), broker, store, "s1", "fix it", nil, "fix it"); err != nil {
		t.Fatalf("StartPiPrompt failed: %v", err)
	}
	waitForRunnerIdle(t, runner, "s1")

	if lines := readPromptLog(t, logPath); len(lines) != 4 {
		t.Fatalf("expected original prompt plus 3 retries, got %d: %#v", len(lines), lines)
	}
	var gotError string
	for _, event := range broker.Replay("s1", 0) {
		if event.Type != "error" {
			continue
		}
		if payload, ok := event.Payload.(map[string]string); ok {
			gotError = payload["error"]
		}
	}
	if gotError != emptyAssistantRetryError {
		t.Fatalf("expected empty assistant retry error, got %q", gotError)
	}
}

func TestRecoveryPromptIsHiddenWhenSessionFileIsParsed(t *testing.T) {
	prompt := emptyAssistantRecoveryPrompt("fix it")
	encodedPrompt, _ := json.Marshal(prompt)
	messages := ParsePiSessionLineMessages(`{"type":"message","message":{"role":"user","content":` + string(encodedPrompt) + `}}`)
	if len(messages) != 0 {
		t.Fatalf("expected recovery prompt to be hidden, got %#v", messages)
	}
}

func TestRetryMarkerParsesAsRetryToolMessage(t *testing.T) {
	body := retryMarkerPrefix + " empty assistant (retrying 1/3)."
	encodedBody, _ := json.Marshal(body)
	messages := ParsePiSessionLineMessages(`{"type":"message","message":{"role":"toolResult","toolName":"pi","content":` + string(encodedBody) + `}}`)
	if len(messages) != 1 {
		t.Fatalf("expected retry marker message, got %#v", messages)
	}
	if got := messages[0]; got.Kind != "tool" || got.Tool != "pi" || got.Status != "retry" || got.CollapsedByDefault {
		t.Fatalf("expected expanded retry tool marker, got %#v", got)
	}
}

func installFakePi(t *testing.T, script string) string {
	t.Helper()
	dir := t.TempDir()
	logPath := filepath.Join(dir, "prompts.log")
	piPath := filepath.Join(dir, "pi")
	if err := os.WriteFile(piPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi: %v", err)
	}
	t.Setenv("PI_FAKE_LOG", logPath)
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	return logPath
}

func runnerTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	store := emptyStore("")
	store.workspaces = []Workspace{{ID: "w1", Name: "w1", Path: dir, Sessions: []Session{{ID: "s1", Title: "test", Workspace: "w1"}}}}
	store.conversations["s1"] = nil
	store.workspacePath["w1"] = dir
	sessionFile := filepath.Join(dir, "session.jsonl")
	if err := os.WriteFile(sessionFile, nil, 0o600); err != nil {
		t.Fatalf("write session file: %v", err)
	}
	store.sessionFiles["s1"] = sessionFile
	store.sessionCWD["s1"] = dir
	store.workspaceSessionDir["w1"] = dir
	store.refreshDisabledWorkspace["w1"] = true
	return store
}

func waitForRunnerIdle(t *testing.T, runner *Runner, sessionID string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if !runner.IsRunning(sessionID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("runner still active for session %s", sessionID)
}

func readPromptLog(t *testing.T, path string) []string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read prompt log: %v", err)
	}
	return strings.Split(strings.TrimSpace(string(content)), "\n")
}

func countRetryMarkers(messages []Message, reason string) int {
	count := 0
	for _, message := range messages {
		if message.Kind == "tool" && message.Tool == "pi" && strings.Contains(message.Body, reason) {
			count++
		}
	}
	return count
}

func assertSessionFileRetryMarkers(t *testing.T, store *Store, want int) {
	t.Helper()
	path, _, ok := store.SessionRuntime("s1")
	if !ok {
		t.Fatal("missing session runtime")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read session file: %v", err)
	}
	if got := strings.Count(string(content), retryMarkerPrefix); got != want {
		t.Fatalf("expected %d persisted retry markers, got %d in %s", want, got, string(content))
	}
}

func overrideLLMIdleTimeouts(t *testing.T, first time.Duration, stream time.Duration) {
	t.Helper()
	oldFirst := firstLLMEventIdleTimeout
	oldStream := streamLLMEventIdleTimeout
	firstLLMEventIdleTimeout = first
	streamLLMEventIdleTimeout = stream
	t.Cleanup(func() {
		firstLLMEventIdleTimeout = oldFirst
		streamLLMEventIdleTimeout = oldStream
	})
}
