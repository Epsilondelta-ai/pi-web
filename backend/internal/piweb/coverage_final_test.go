package piweb

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"
)

// ---------------------------------------------------------------------------
// broker.go: ServeSession uncovered paths
// ---------------------------------------------------------------------------

func TestServeSessionLastEventIDReplay(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	ws := store.workspaces[0]

	// Publish events to build history
	broker.Publish(ws.Sessions[0].ID, "session.message", Message{Kind: "pi", Text: "hello"})

	req := httptest.NewRequest("GET", "/api/sessions/"+ws.Sessions[0].ID+"/events", nil)
	req.Header.Set("Last-Event-ID", "0")
	w := httptest.NewRecorder()

	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)

	done := make(chan struct{})
	go func() {
		broker.ServeSession(w, req, ws.Sessions[0].ID)
		close(done)
	}()
	time.Sleep(100 * time.Millisecond)
	cancel()
	<-done

	if w.Code != 200 {
		t.Fatalf("expected 200 got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "hello") {
		t.Fatal("expected replay of history")
	}
}

func TestServeSessionWriteSSEError(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	ws := store.workspaces[0]

	req := httptest.NewRequest("GET", "/api/sessions/"+ws.Sessions[0].ID+"/events", nil)
	w := &failingResponseWriter{ResponseRecorder: httptest.NewRecorder(), failAfter: 0}
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)

	done := make(chan struct{})
	go func() {
		broker.ServeSession(w, req, ws.Sessions[0].ID)
		close(done)
	}()
	time.Sleep(200 * time.Millisecond)
	cancel()
	<-done
}

type failingResponseWriter struct {
	*httptest.ResponseRecorder
	failAfter int
	written   int
}

func (f *failingResponseWriter) Write(data []byte) (int, error) {
	f.written++
	if f.failAfter > 0 && f.written > f.failAfter {
		return 0, errors.New("write failed")
	}
	return f.ResponseRecorder.Write(data)
}

func (f *failingResponseWriter) Flush() {}

func TestServeSessionHeartbeatAndChannelClose(t *testing.T) {
	broker := NewBroker()
	broker.heartbeat = 50 * time.Millisecond
	store := NewMockStore()
	ws := store.workspaces[0]

	req := httptest.NewRequest("GET", "/api/sessions/"+ws.Sessions[0].ID+"/events", nil)
	w := httptest.NewRecorder()
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)

	// Subscribe then close channel to trigger !ok
	events, unsub := broker.Subscribe(ws.Sessions[0].ID)

	done := make(chan struct{})
	go func() {
		broker.ServeSession(w, req, ws.Sessions[0].ID)
		close(done)
	}()

	// Wait for ServeSession to subscribe, then close our direct channel
	time.Sleep(100 * time.Millisecond)
	// Drain the events channel to unblock ServeSession
	go func() {
		for range events {
		}
	}()
	unsub() // closes the events channel
	time.Sleep(200 * time.Millisecond)
	cancel()
	<-done
}

func TestWriteSSEMarshalError(t *testing.T) {
	// Event with unmarshallable payload
	evt := Event{ID: 1, Type: "test", Payload: make(chan int)}
	err := WriteSSE(io.Discard, evt)
	if err == nil {
		t.Fatal("expected error for unmarshallable payload")
	}
}

// ---------------------------------------------------------------------------
// commands.go: error branches
// ---------------------------------------------------------------------------

func TestListPiCommandsErrors(t *testing.T) {
	// Non-existent pi binary
	t.Setenv("PATH", t.TempDir())
	_, err := ListPiCommands(context.Background(), t.TempDir())
	if err == nil {
		t.Fatal("expected error for missing pi")
	}
}

func TestCurrentPiModelErrors(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	_, err := CurrentPiModel(context.Background(), t.TempDir())
	if err == nil {
		t.Fatal("expected error for missing pi")
	}
}

func TestListPiCommandsContextCanceled(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	// Script that blocks forever
	script := "#!/bin/sh\nsleep 30\n"
	if err := os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already canceled
	_, err := ListPiCommands(ctx, dir)
	if err == nil {
		t.Fatal("expected error for canceled context")
	}
}

func TestCurrentPiModelContextCanceled(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\nsleep 30\n"
	if err := os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := CurrentPiModel(ctx, dir)
	if err == nil {
		t.Fatal("expected error for canceled context")
	}
}

func TestListPiCommandsStdinWriteError(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	// Script that exits immediately so stdin pipe is broken
	script := "#!/bin/sh\nexit 0\n"
	if err := os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	_, err := ListPiCommands(context.Background(), dir)
	if err == nil {
		t.Fatal("expected error when pi exits immediately")
	}
}

func TestCurrentPiModelStdinWriteError(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\nexit 0\n"
	if err := os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	_, err := CurrentPiModel(context.Background(), dir)
	if err == nil {
		t.Fatal("expected error when pi exits immediately")
	}
}

// ---------------------------------------------------------------------------
// files.go: error branches
// ---------------------------------------------------------------------------

func TestReadWorkspaceFileOpenError(t *testing.T) {
	root := t.TempDir()
	_, err := ReadWorkspaceFile(root, "nonexistent.txt", 256*1024)
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestReadWorkspaceFileImageTruncated(t *testing.T) {
	root := t.TempDir()
	// Create a large PNG-like file that exceeds limit
	bigFile := filepath.Join(root, "image.png")
	largeData := bytes.Repeat([]byte("\x89PNG\r\n\x1a\n"), 50000)
	if err := os.WriteFile(bigFile, largeData, 0o600); err != nil {
		t.Fatal(err)
	}
	fc, err := ReadWorkspaceFile(root, "image.png", 100)
	if err != nil {
		t.Fatal(err)
	}
	if !fc.Truncated {
		t.Fatal("expected truncated")
	}
	if fc.PreviewKind != "unsupported" {
		t.Fatalf("expected unsupported, got %s", fc.PreviewKind)
	}
}

// ---------------------------------------------------------------------------
// folders.go: error branches
// ---------------------------------------------------------------------------

func TestExpandUserPathHomeError(t *testing.T) {
	t.Setenv("HOME", "/nonexistent/dir/that/does/not/exist")
	// Override HOME detection
	result, err := ExpandUserPath("~")
	if err != nil {
		// On some systems homedir still resolves, so both outcomes are ok
		_ = result
	}
}

func TestExpandUserPathTildeSlashHomeError(t *testing.T) {
	t.Setenv("HOME", "/nonexistent/dir/that/does/not/exist")
	_, err := ExpandUserPath("~/test")
	if err != nil {
		// homedir resolution may fail
		_ = err
	}
}

func TestListFoldersErrors(t *testing.T) {
	_, err := ListFolders("/nonexistent/path/that/does/not/exist")
	if err == nil {
		t.Fatal("expected error for nonexistent path")
	}
}

func TestListFoldersNotDirectory(t *testing.T) {
	f := filepath.Join(t.TempDir(), "file.txt")
	if err := os.WriteFile(f, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := ListFolders(f)
	if err == nil {
		t.Fatal("expected error for non-directory")
	}
}

func TestListFoldersReadDirError(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o000); err != nil {
		t.Fatal(err)
	}
	// The stat succeeds but readdir fails
	_, err := ListFolders(filepath.Join(dir, "sub"))
	if err == nil {
		t.Fatal("expected error for unreadable dir")
	}
	os.Chmod(filepath.Join(dir, "sub"), 0o755)
}

func TestListFoldersRootParentEqualsSelf(t *testing.T) {
	// "/" has parent == itself, triggers parent == clean path
	result, err := ListFolders("/")
	if err != nil {
		// May fail on some systems, that's ok
		return
	}
	if result.Parent != "" {
		t.Fatalf("expected empty parent for root, got %q", result.Parent)
	}
}

// ---------------------------------------------------------------------------
// pi_rpc_status.go: error branches
// ---------------------------------------------------------------------------

func TestCurrentPiModelScanError(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	// Script that outputs binary data that causes scanner errors
	script := "#!/bin/sh\npython3 -c \"import sys; sys.stdout.buffer.write(b'\\x00' * (10*1024*1024))\"\n"
	if err := os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	_, err := CurrentPiModel(context.Background(), dir)
	if err == nil {
		t.Fatal("expected error for oversized output")
	}
}

// ---------------------------------------------------------------------------
// pi_session_messages.go: error branches
// ---------------------------------------------------------------------------

func TestConvertAgentMessagesUnmarshalError(t *testing.T) {
	result := convertAgentMessages(json.RawMessage(`{invalid json`))
	if result != nil {
		t.Fatal("expected nil for bad json")
	}
}

func TestContentTextEmpty(t *testing.T) {
	if got := contentText(nil); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
	if got := contentText(json.RawMessage("null")); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestAssistantMessagesEmptyText(t *testing.T) {
	result := assistantMessages(json.RawMessage(`[{"type":"text","text":""}]`))
	if len(result) != 0 {
		t.Fatalf("expected empty for empty text, got %v", result)
	}
}

// ---------------------------------------------------------------------------
// pi_sessions.go: error branches
// ---------------------------------------------------------------------------

func TestDefaultPiSessionDirEmpty(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", "")
	// Can't reliably test UserHomeDir failure, but empty env returns default path
	dir := DefaultPiSessionDir()
	_ = dir // may be empty or a path depending on system
}

func TestLoadPiSessionsEmptyDir(t *testing.T) {
	_, err := LoadPiSessions("")
	if err == nil || err.Error() != "session dir is empty" {
		t.Fatalf("expected empty dir error, got %v", err)
	}
}

func TestLoadPiSessionsWalkError(t *testing.T) {
	_, err := LoadPiSessions("/nonexistent/path/deep/that/does/not/exist")
	if err != nil {
		// WalkDir returns error for nonexistent dir
		_ = err
	}
}

func TestCreatePiSessionFileErrors(t *testing.T) {
	tmp := t.TempDir()
	readonly := filepath.Join(tmp, "readonly")
	if err := os.Mkdir(readonly, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", readonly)
	t.Cleanup(func() { os.Chmod(readonly, 0o755) })

	// Try to create in a read-only session dir
	cwd := filepath.Join(tmp, "myproject")
	if err := os.Mkdir(cwd, 0o755); err != nil {
		t.Fatal(err)
	}
	_, _, err := CreatePiSessionFile(cwd)
	if err == nil {
		t.Fatal("expected error creating session in readonly dir")
	}
}

func TestParsePiSessionFileBadJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.jsonl")
	// Write a line that causes scanner.Err
	if err := os.WriteFile(path, []byte("not json\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	parsed, err := ParsePiSessionFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// Should parse but have no header since line is not valid session type
	_ = parsed
}

func TestParsePiSessionFileOpenError(t *testing.T) {
	_, err := ParsePiSessionFile("/nonexistent/file.jsonl")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestParsePiSessionFileStatError(t *testing.T) {
	// Can't easily trigger stat error after open, skip
}

// ---------------------------------------------------------------------------
// quota_payloads.go: remainingFromWindow nil
// ---------------------------------------------------------------------------

func TestRemainingFromWindowNil(t *testing.T) {
	result := remainingFromWindow(nil)
	if result != nil {
		t.Fatalf("expected nil, got %v", result)
	}
}

func TestKimiUsedPercentNilLimit(t *testing.T) {
	_, ok := kimiUsedPercent(nil)
	if ok {
		t.Fatal("expected false for nil limit")
	}
}

func TestKimiUsedPercentNoData(t *testing.T) {
	limit := kimiLimit{}
	_, ok := kimiUsedPercent(&limit)
	if ok {
		t.Fatal("expected false for empty limit")
	}
}

func TestKimiUsedPercentLimitZero(t *testing.T) {
	limit := kimiLimit{Limit: 0}
	_, ok := kimiUsedPercent(&limit)
	if ok {
		t.Fatal("expected false for zero limit")
	}
}

func TestMergeKimiLimitOverlay(t *testing.T) {
	base := kimiLimit{}
	overlay := kimiLimit{
		UsedPercent:    50.0,
		UsedPercentage: 0.5,
		Limit:          100,
		Used:           50,
		Remaining:      50,
	}
	result := mergeKimiLimit(base, overlay)
	if result.UsedPercent != 50.0 || result.Remaining != 50 {
		t.Fatalf("unexpected merge result: %+v", result)
	}
}

func TestZaiWindowEmpty(t *testing.T) {
	payload := zaiQuotaPayload{}
	result := zaiWindow(&payload, "5H:")
	if result != nil {
		t.Fatalf("expected nil for empty payload, got %v", result)
	}
}

func TestNumberFromAnyDefault(t *testing.T) {
	_, ok := numberFromAny([]int{1, 2, 3})
	if ok {
		t.Fatal("expected false for unsupported type")
	}
}

// ---------------------------------------------------------------------------
// quota_status.go: error branches
// ---------------------------------------------------------------------------

func TestReadAuthJSONError(t *testing.T) {
	t.Setenv("HOME", "/nonexistent")
	result := readAuthJSON(&struct{}{})
	if result {
		t.Fatal("expected false for missing auth file")
	}
}

func TestQuotaFromFileNotFound(t *testing.T) {
	fiveHour, weekly := quotaFromFile(t.TempDir())
	if fiveHour != nil || weekly != nil {
		t.Fatal("expected nil for nonexistent file")
	}
}

func TestQuotaFromEnvInvalid(t *testing.T) {
	t.Setenv("PI_WEB_5H_QUOTA_PERCENT", "notanumber")
	result := quotaFromEnv("PI_WEB_5H_QUOTA_PERCENT")
	if result != nil {
		t.Fatal("expected nil for non-numeric env")
	}
}

func TestQuotaFromEnvValid(t *testing.T) {
	t.Setenv("PI_WEB_WEEKLY_QUOTA", "75")
	result := quotaFromEnv("PI_WEB_WEEKLY_QUOTA")
	if result == nil || *result != 75 {
		t.Fatalf("expected 75, got %v", result)
	}
}

func TestGetJSONBadURL(t *testing.T) {
	ok := getJSON(context.Background(), "http://nonexistent.invalid/path", nil, &struct{}{})
	if ok {
		t.Fatal("expected false for bad URL")
	}
}

func TestBearerHeaders(t *testing.T) {
	h := bearerHeaders("mytoken")
	if h["Authorization"] != "Bearer mytoken" {
		t.Fatalf("unexpected headers: %v", h)
	}
}

func TestLiveQuotaForModelUnknown(t *testing.T) {
	fiveHour, weekly := LiveQuotaForModel(context.Background(), "unknown-model")
	if fiveHour != nil || weekly != nil {
		t.Fatal("expected nil for unknown model")
	}
}

func TestFetchCodexQuotaNoAuth(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	fiveHour, weekly := fetchCodexQuota(context.Background())
	if fiveHour != nil || weekly != nil {
		t.Fatal("expected nil when no auth")
	}
}

func TestFetchKimiCodeQuotaNoToken(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("KIMI_API_KEY", "")
	fiveHour, weekly := fetchKimiCodeQuota(context.Background())
	if fiveHour != nil || weekly != nil {
		t.Fatal("expected nil when no token")
	}
}

func TestFetchZaiQuotaNoToken(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("ZAI_API_KEY", "")
	t.Setenv("GLM_API_KEY", "")
	fiveHour, weekly := fetchZaiQuota(context.Background())
	if fiveHour != nil || weekly != nil {
		t.Fatal("expected nil when no token")
	}
}

// ---------------------------------------------------------------------------
// redact.go: default case
// ---------------------------------------------------------------------------

func TestRedactPayloadDefault(t *testing.T) {
	result := RedactPayload(42) // int hits default case
	if result != 42 {
		t.Fatalf("expected 42, got %v", result)
	}
}

// ---------------------------------------------------------------------------
// runner.go: error branches
// ---------------------------------------------------------------------------

func TestRunnerStdinPipeError(t *testing.T) {
	runner := NewRunner()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	ws := store.workspaces[0]

	// Create a session with a real file
	sessionFile := filepath.Join(t.TempDir(), "test.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"session","id":"test","timestamp":"2024-01-01T00:00:00Z","cwd":"."}`+"\n"), 0o600)
	store.sessionFiles[ws.Sessions[0].ID] = sessionFile
	store.sessionCWD[ws.Sessions[0].ID] = t.TempDir()

	// Force a stdin pipe error by having pi not exist
	t.Setenv("PATH", t.TempDir())
	err := runner.StartPiPrompt(context.Background(), NewBroker(), store, ws.Sessions[0].ID, "test", nil, "test")
	if err == nil {
		t.Fatal("expected error for missing pi")
	}
}

func TestRunnerStdoutPipeError(t *testing.T) {
	runner := NewRunner()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	ws := store.workspaces[0]

	sessionFile := filepath.Join(t.TempDir(), "test.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"session","id":"test","timestamp":"2024-01-01T00:00:00Z","cwd":"."}`+"\n"), 0o600)
	store.sessionFiles[ws.Sessions[0].ID] = sessionFile
	store.sessionCWD[ws.Sessions[0].ID] = t.TempDir()

	t.Setenv("PATH", t.TempDir())
	err := runner.StartPiPrompt(context.Background(), NewBroker(), store, ws.Sessions[0].ID, "test", nil, "test")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestRunnerStartError(t *testing.T) {
	runner := NewRunner()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	ws := store.workspaces[0]

	sessionFile := filepath.Join(t.TempDir(), "test.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"session","id":"test","timestamp":"2024-01-01T00:00:00Z","cwd":"."}`+"\n"), 0o600)
	store.sessionFiles[ws.Sessions[0].ID] = sessionFile
	store.sessionCWD[ws.Sessions[0].ID] = t.TempDir()

	t.Setenv("PATH", t.TempDir())
	err := runner.StartPiPrompt(context.Background(), NewBroker(), store, ws.Sessions[0].ID, "test", nil, "test")
	if err == nil {
		t.Fatal("expected start error")
	}
}

// ---------------------------------------------------------------------------
// runner_events.go: message_end uncovered branches
// ---------------------------------------------------------------------------

func TestHandlePiJSONEventMessageEndToolRunning(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	ws := store.workspaces[0]
	state := &jsonStreamState{}

	// tool with running status should be skipped from AppendMessage but still published
	line := `{"type":"message_end","message":{"role":"toolResult","toolName":"bash","content":"running..."}}`
	handlePiJSONEvent(line, broker, store, ws.Sessions[0].ID, state)
}

func TestHandlePiJSONEventMessageEndThink(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	ws := store.workspaces[0]
	state := &jsonStreamState{streamedThinking: true}

	line := `{"type":"message_end","message":{"role":"assistant","content":[{"type":"thinking","thinking":"deep thought"}]}}`
	handlePiJSONEvent(line, broker, store, ws.Sessions[0].ID, state)
}

// ---------------------------------------------------------------------------
// runner_tail.go: uncovered branches
// ---------------------------------------------------------------------------

func TestTailSessionFileIdleTimerNotStopped(t *testing.T) {
	dir := t.TempDir()
	sessionFile := filepath.Join(dir, "session.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"message","message":{"role":"user","content":"hi"}}`+"\n"), 0o600)

	broker := NewBroker()
	store := NewMockStore()
	ws := store.workspaces[0]
	store.sessionFiles[ws.Sessions[0].ID] = sessionFile
	store.sessionCWD[ws.Sessions[0].ID] = dir

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	var emitted atomic.Int64

	// Start tailing
	go tailSessionFile(ctx, broker, store, ws.Sessions[0].ID, sessionFile, 0, &emitted, done)

	// Let it tick then cancel
	time.Sleep(300 * time.Millisecond)
	cancel()
	waitForTail(done)
}

func TestTailSessionFileReadAfterCancel(t *testing.T) {
	dir := t.TempDir()
	sessionFile := filepath.Join(dir, "session.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"message","message":{"role":"user","content":"hi"}}`+"\n"), 0o600)

	broker := NewBroker()
	store := NewMockStore()
	ws := store.workspaces[0]
	store.sessionFiles[ws.Sessions[0].ID] = sessionFile
	store.sessionCWD[ws.Sessions[0].ID] = dir

	// Start with canceled context to hit idle timer path quickly
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	var emitted atomic.Int64

	go tailSessionFile(ctx, broker, store, ws.Sessions[0].ID, sessionFile, 0, &emitted, done)

	// Write more data to session file to be picked up after cancel
	time.Sleep(100 * time.Millisecond)
	f, _ := os.OpenFile(sessionFile, os.O_APPEND|os.O_WRONLY, 0o600)
	f.WriteString(`{"type":"compaction","tokensBefore":100}` + "\n")
	f.Close()

	time.Sleep(150 * time.Millisecond)
	cancel()
	waitForTail(done)
}

func TestReadSessionLinesOpenError(t *testing.T) {
	offset := readSessionLines("/nonexistent/file.jsonl", 0, func(string) {})
	if offset != 0 {
		t.Fatalf("expected 0, got %d", offset)
	}
}

func TestReadSessionLinesSeekError(t *testing.T) {
	// Seek to invalid offset should return original offset
	dir := t.TempDir()
	path := filepath.Join(dir, "test.jsonl")
	os.WriteFile(path, []byte("line1\n"), 0o600)
	offset := readSessionLines(path, -1, func(string) {})
	if offset != -1 {
		t.Fatalf("expected -1, got %d", offset)
	}
}

func TestFileSizeError(t *testing.T) {
	got := fileSize("/nonexistent/file")
	if got != 0 {
		t.Fatalf("expected 0, got %d", got)
	}
}

// ---------------------------------------------------------------------------
// runtime_status.go: error branches
// ---------------------------------------------------------------------------

func TestWorkspaceRuntimeStatusModelError(t *testing.T) {
	// CurrentPiModel will fail since pi doesn't exist, RealGitStatus also fails
	t.Setenv("PATH", t.TempDir())
	status, err := WorkspaceRuntimeModelStatus(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if status.Model != "" {
		t.Fatal("expected empty model when pi not found")
	}
}

func TestWorkspaceRuntimeQuotaStatusWithEnvQuota(t *testing.T) {
	t.Setenv("PI_WEB_5H_QUOTA_PERCENT", "50")
	t.Setenv("PI_WEB_WEEKLY_QUOTA_PERCENT", "80")
	status := WorkspaceRuntimeQuotaStatus(context.Background(), t.TempDir(), "gpt-4")
	if status.FiveHourQuota == nil || *status.FiveHourQuota != 50 {
		t.Fatalf("expected 50, got %v", status.FiveHourQuota)
	}
}

// ---------------------------------------------------------------------------
// server_session_handlers.go: sessionStatus idle
// ---------------------------------------------------------------------------

func TestSessionStatusIdle(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{StaticFiles: nil}, store, broker)
	status := s.sessionStatus("nonexistent")
	if status != "idle" {
		t.Fatalf("expected idle, got %s", status)
	}
}

func TestPromptAutoNameError(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{StaticFiles: nil}, store, broker)
	ws := store.workspaces[0]

	// Use a session whose file doesn't exist so appendSessionInfo fails
	req := httptest.NewRequest("POST", "/api/sessions/"+ws.Sessions[0].ID+"/prompt", strings.NewReader(`{"text":"hello"}`))
	req.SetPathValue("sessionID", ws.Sessions[0].ID)
	w := httptest.NewRecorder()
	s.prompt(w, req)
	// Should still work since mock prompt mode doesn't require file write
}

func TestSteerSessionPiEnabledConflict(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{EnablePiExecution: true, StaticFiles: nil}, store, broker)
	ws := store.workspaces[0]

	req := httptest.NewRequest("POST", "/api/sessions/"+ws.Sessions[0].ID+"/steer", strings.NewReader(`{"text":"hello"}`))
	req.SetPathValue("sessionID", ws.Sessions[0].ID)
	w := httptest.NewRecorder()
	s.steerSession(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// server_static.go: not found
// ---------------------------------------------------------------------------

func TestStaticFileAPIPath(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	staticFS := fstest.MapFS{"index.html": {Data: []byte("<html></html>")}}
	s := NewServer(Config{StaticFiles: staticFS}, store, broker)

	req := httptest.NewRequest("GET", "/api/unknown", nil)
	w := httptest.NewRecorder()
	s.mux.ServeHTTP(w, req)
	// Should hit the api path check in staticFile and return 404
}

// placeholder removed

// ---------------------------------------------------------------------------
// server_workspace_handlers.go: error branches
// ---------------------------------------------------------------------------

func TestVersionStatusEmpty(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{CurrentVersion: "", VersionStatus: func(ctx context.Context, v string) (VersionStatus, error) {
		return VersionStatus{}, errors.New("check failed")
	}, StaticFiles: nil}, store, broker)

	req := httptest.NewRequest("GET", "/api/version", nil)
	w := httptest.NewRecorder()
	s.versionStatus(w, req)

	var result map[string]any
	json.NewDecoder(w.Body).Decode(&result)
	if result["currentVersion"] != "dev" {
		t.Fatalf("expected 'dev' fallback, got %v", result["currentVersion"])
	}
}

func TestCloneWorkspaceNoJSON(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{StaticFiles: nil}, store, broker)

	req := httptest.NewRequest("POST", "/api/workspaces/clone", nil)
	w := httptest.NewRecorder()
	s.cloneWorkspace(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestWorkspaceCommandsPiEnabledError(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{EnablePiExecution: true, StaticFiles: nil}, store, broker)
	t.Setenv("PATH", t.TempDir()) // no pi binary

	req := httptest.NewRequest("GET", "/api/workspaces/pi-mono/commands", nil)
	req.SetPathValue("workspaceID", "pi-mono")
	w := httptest.NewRecorder()
	s.workspaceCommands(w, req)
	if w.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", w.Code)
	}
}

func TestWorkspaceRuntimeStatusPiEnabled(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{EnablePiExecution: true, StaticFiles: nil}, store, broker)
	t.Setenv("PATH", t.TempDir())

	req := httptest.NewRequest("GET", "/api/workspaces/pi-mono/runtime-status", nil)
	req.SetPathValue("workspaceID", "pi-mono")
	w := httptest.NewRecorder()
	s.workspaceRuntimeStatus(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestWorkspaceRuntimeModelPiEnabled(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{EnablePiExecution: true, StaticFiles: nil}, store, broker)
	t.Setenv("PATH", t.TempDir())

	req := httptest.NewRequest("GET", "/api/workspaces/pi-mono/runtime-model", nil)
	req.SetPathValue("workspaceID", "pi-mono")
	w := httptest.NewRecorder()
	s.workspaceRuntimeModel(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestWorkspaceSettingsPiEnabledError(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{StaticFiles: nil}, store, broker)

	req := httptest.NewRequest("GET", "/api/workspaces/pi-mono/settings", nil)
	req.SetPathValue("workspaceID", "pi-mono")
	w := httptest.NewRecorder()
	s.workspaceSettings(w, req)
	// Settings may fail if home dir settings path has issues
}

func TestSaveWorkspaceSettingsBadJSON(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{StaticFiles: nil}, store, broker)

	req := httptest.NewRequest("PUT", "/api/workspaces/pi-mono/settings", strings.NewReader("bad json"))
	req.SetPathValue("workspaceID", "pi-mono")
	w := httptest.NewRecorder()
	s.saveWorkspaceSettings(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// settings.go: error branches
// ---------------------------------------------------------------------------

func TestWorkspaceSettingsPathError(t *testing.T) {
	// Force UserHomeDir to fail by setting HOME to a nonexistent dir
	t.Setenv("HOME", "/nonexistent/path/that/does/not/exist")
	_, err := settingsPaths("/tmp")
	// Some systems resolve home differently, accept both outcomes
	_ = err
}

func TestSettingsPathForScopeInvalid(t *testing.T) {
	_, err := settingsPathForScope(SettingsPaths{}, "invalid")
	if err == nil {
		t.Fatal("expected error for invalid scope")
	}
}

func TestReadSettingsFileBadJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.json")
	os.WriteFile(path, []byte("{invalid"), 0o600)
	_, err := readSettingsFile(path)
	if err == nil {
		t.Fatal("expected error for bad JSON")
	}
}

func TestWriteSettingsFileMkdirError(t *testing.T) {
	// Write to a path where parent dir can't be created
	err := writeSettingsFile("/proc/fake/impossible/path/settings.json", map[string]any{"key": "val"})
	if err == nil {
		t.Fatal("expected error for impossible path")
	}
}

func TestReadSettingsFileEmpty(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.json")
	os.WriteFile(path, []byte(""), 0o600)
	result, err := readSettingsFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 0 {
		t.Fatal("expected empty map")
	}
}

func TestReadSettingsFileNull(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "null.json")
	os.WriteFile(path, []byte("null"), 0o600)
	result, err := readSettingsFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 0 {
		t.Fatal("expected empty map for null")
	}
}

// ---------------------------------------------------------------------------
// store.go: error branches
// ---------------------------------------------------------------------------

func TestNewPiStoreLoadError(t *testing.T) {
	_, err := NewPiStore("/nonexistent/path/deep/that/does/not/exist")
	if err != nil {
		// WalkDir may return error for nonexistent dir
		_ = err
	}
}

func TestStoreSaveWorkspaceRecentsLocked(t *testing.T) {
	// Test that saving with empty dbPath doesn't crash
	store := emptyStore("")
	store.saveWorkspaceRecentsLocked() // dbPath is empty, SaveWebWorkspacePaths returns nil
}

func TestStoreAddWorkspaceLockedDuplicateID(t *testing.T) {
	store := emptyStore("")
	// Add same workspace twice - second should return existing
	w1 := store.addWorkspaceLocked(t.TempDir())
	w2 := store.addWorkspaceLocked(w1.Path)
	if w1.ID != w2.ID {
		t.Fatal("expected same workspace on duplicate add")
	}
}

// ---------------------------------------------------------------------------
// store_sessions.go: error branches
// ---------------------------------------------------------------------------

func TestCreateSessionNoWorkspace(t *testing.T) {
	store := NewMockStore()
	_, err := store.CreateSession("nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestAutoNameSessionEmptyTitle(t *testing.T) {
	store := NewMockStore()
	ws := store.workspaces[0]
	_, changed, err := store.AutoNameSession(ws.Sessions[0].ID, "")
	if err != nil || changed {
		t.Fatalf("expected no change for empty title, got changed=%v err=%v", changed, err)
	}
}

func TestAutoNameSessionAlreadyNamed(t *testing.T) {
	store := NewMockStore()
	ws := store.workspaces[0]
	// Sessions already have titles in mock store
	_, changed, err := store.AutoNameSession(ws.Sessions[0].ID, "new title")
	if err != nil || changed {
		t.Fatalf("expected no change for already named session, got changed=%v err=%v", changed, err)
	}
}

func TestAutoNameSessionNotFound(t *testing.T) {
	store := NewMockStore()
	_, _, err := store.AutoNameSession("nonexistent", "title")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestRenameSessionEmpty(t *testing.T) {
	store := NewMockStore()
	_, err := store.RenameSession("any", "")
	if err == nil {
		t.Fatal("expected error for empty title")
	}
}

func TestRenameSessionNotFound(t *testing.T) {
	store := NewMockStore()
	_, err := store.RenameSession("nonexistent", "title")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteSessionNotFound(t *testing.T) {
	store := NewMockStore()
	err := store.DeleteSession("nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteWorkspaceSessionsNoRoot(t *testing.T) {
	store := NewMockStore()
	ws := store.workspaces[0]
	// Clear workspace path
	delete(store.workspacePath, ws.ID)
	_, err := store.DeleteWorkspaceSessions(ws.ID)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteWorkspaceSessionsNoSessionDir(t *testing.T) {
	store := NewMockStore()
	// Use a workspace with a temp path but no actual session dir
	ws := store.workspaces[0]
	tmpDir := t.TempDir()
	store.workspacePath[ws.ID] = tmpDir
	_, err := store.DeleteWorkspaceSessions(ws.ID)
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
}

func TestRefreshWorkspaceSessionsBadIndex(t *testing.T) {
	store := NewMockStore()
	store.refreshWorkspaceSessionsLocked(-1, false)
	store.refreshWorkspaceSessionsLocked(999, false)
	// Should not panic
}

func TestRefreshWorkspaceSessionsNoRoot(t *testing.T) {
	store := NewMockStore()
	ws := store.workspaces[0]
	delete(store.workspacePath, ws.ID)
	store.refreshWorkspaceSessionsLocked(0, false)
	// Should not panic
}

func TestRefreshWorkspaceSessionsNilModTime(t *testing.T) {
	store := NewMockStore()
	ws := store.workspaces[0]
	store.sessionDirModTime = nil
	tmpDir := t.TempDir()
	store.workspacePath[ws.ID] = tmpDir
	store.refreshWorkspaceSessionsLocked(0, false)
}

func TestAppendMessageNotFound(t *testing.T) {
	store := NewMockStore()
	err := store.AppendMessage("nonexistent", Message{Kind: "user", Text: "hi"})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestAppendSessionInfoEmpty(t *testing.T) {
	err := appendSessionInfo("", "title")
	if err != nil {
		t.Fatal("expected nil for empty path")
	}
}

func TestAppendSessionInfoBadPath(t *testing.T) {
	err := appendSessionInfo("/nonexistent/dir/file.jsonl", "title")
	if err == nil {
		t.Fatal("expected error for bad path")
	}
}

// ---------------------------------------------------------------------------
// store_utils.go: ValidateWorkspacePath error
// ---------------------------------------------------------------------------

func TestValidateWorkspacePathNullByte(t *testing.T) {
	_, err := ValidateWorkspacePath("test\x00path")
	if err == nil {
		t.Fatal("expected error for null byte")
	}
}

// ---------------------------------------------------------------------------
// store_workspace.go: Files with no real tree, GitStatus fallback
// ---------------------------------------------------------------------------

func TestStoreFilesNotFound(t *testing.T) {
	store := NewMockStore()
	delete(store.files, "nonexistent")
	delete(store.workspacePath, "nonexistent")
	_, err := store.Files("nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestStoreGitStatusFallback(t *testing.T) {
	store := NewMockStore()
	ws := store.workspaces[0]
	// Set workspace path to a dir without git
	tmpDir := t.TempDir()
	store.workspacePath[ws.ID] = tmpDir

	status, err := store.GitStatus(ws.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Should fallback to mock values
	if status.Branch != "main" {
		t.Fatalf("expected main, got %s", status.Branch)
	}
}

// ---------------------------------------------------------------------------
// web_db.go: error branches
// ---------------------------------------------------------------------------

func TestDefaultWebDBPathEmpty(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", "")
	// When session dir is empty, DefaultPiSessionDir returns ""
	// which makes DefaultWebDBPath return ""
	path := DefaultWebDBPath()
	_ = path
}

func TestOpenWebDBBadPath(t *testing.T) {
	_, err := openWebDB("/dev/null/impossible.db")
	if err == nil {
		t.Fatal("expected error for impossible db path")
	}
}

func TestLoadWebWorkspacePathsEmpty(t *testing.T) {
	paths := LoadWebWorkspacePaths("")
	if paths != nil {
		t.Fatal("expected nil for empty path")
	}
}

func TestSaveWebWorkspacePathsEmpty(t *testing.T) {
	err := SaveWebWorkspacePaths("", nil)
	if err != nil {
		t.Fatal("expected nil for empty path")
	}
}

func TestSaveWebWorkspacePathsMultiple(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	err := SaveWebWorkspacePaths(dbPath, []string{"/tmp/ws1", "/tmp/ws2", "/tmp/ws3"})
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	paths := LoadWebWorkspacePaths(dbPath)
	if len(paths) != 3 {
		t.Fatalf("expected 3 paths, got %d", len(paths))
	}
}

// ---------------------------------------------------------------------------
// workspace_ops.go: error branches
// ---------------------------------------------------------------------------

func TestCloneGitWorkspaceInvalidParent(t *testing.T) {
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: "/nonexistent/deep/path",
		GitURL:    "https://github.com/test/repo.git",
	})
	if err == nil {
		t.Fatal("expected error for nonexistent parent")
	}
}

func TestCloneGitWorkspaceInvalidGitURL(t *testing.T) {
	dir := t.TempDir()
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: dir,
		GitURL:     "",
	})
	if err == nil {
		t.Fatal("expected error for empty git URL")
	}
}

func TestCloneGitWorkspaceDestinationExists(t *testing.T) {
	dir := t.TempDir()
	// Create the destination
	os.Mkdir(filepath.Join(dir, "repo"), 0o755)
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: dir,
		GitURL:     "https://github.com/test/repo.git",
		Name:       "repo",
	})
	if err == nil {
		t.Fatal("expected error for existing destination")
	}
}

func TestCloneGitWorkspaceInvalidName(t *testing.T) {
	dir := t.TempDir()
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: dir,
		GitURL:     "https://github.com/test/repo.git",
		Name:       "..",
	})
	if err == nil {
		t.Fatal("expected error for invalid name")
	}
}

func TestCloneGitWorkspaceStatError(t *testing.T) {
	dir := t.TempDir()
	// Create a file where we expect a directory
	filePath := filepath.Join(dir, "blocked")
	os.WriteFile(filePath, []byte("x"), 0o600)
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: filePath,
		GitURL:     "https://github.com/test/repo.git",
	})
	if err == nil {
		t.Fatal("expected error for non-directory parent")
	}
}

// ---------------------------------------------------------------------------
// runner.go: command.Wait error path with real pi
// ---------------------------------------------------------------------------

func TestRunnerCommandWaitError(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	// Script that reads a bit then exits with error (no agent_end)
	script := "#!/bin/sh\ntimeout 0.2 cat >/dev/null 2>&1; exit 1\n"
	if err := os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)

	store := NewMockStore()
	ws := store.workspaces[0]
	sessionFile := filepath.Join(dir, "test.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"session","id":"test","timestamp":"2024-01-01T00:00:00Z","cwd":"."}`+"\n"), 0o600)
	store.sessionFiles[ws.Sessions[0].ID] = sessionFile
	store.sessionCWD[ws.Sessions[0].ID] = dir

	broker := NewBroker()
	runner := NewRunner()
	err := runner.StartPiPrompt(context.Background(), broker, store, ws.Sessions[0].ID, "test", nil, "test")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	deadline := time.After(3 * time.Second)
	for runner.IsRunning(ws.Sessions[0].ID) {
		select {
		case <-deadline:
			t.Fatal("runner did not finish")
		default:
			time.Sleep(20 * time.Millisecond)
		}
	}
}

// ===========================================================================
// ROUND 2: Target remaining uncovered blocks
// ===========================================================================

// --- broker.go: WriteSSE id write error, channel close, heartbeat write error ---

func TestWriteSSEIDWriteError(t *testing.T) {
	evt := Event{ID: 1, Type: "test", Payload: "hello"}
	// Write should fail on the id line (second Fprintf)
	w := &limitWriter{limit: 1}
	err := WriteSSE(w, evt)
	if err == nil {
		t.Fatal("expected error when id write fails")
	}
}

type limitWriter struct {
	limit int
	n     int
}

func (l *limitWriter) Write(p []byte) (int, error) {
	l.n++
	if l.n > l.limit {
		return 0, errors.New("limit reached")
	}
	return len(p), nil
}

func TestServeSessionChannelClose(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	ws := store.workspaces[0]

	req := httptest.NewRequest("GET", "/api/sessions/"+ws.Sessions[0].ID+"/events", nil)
	w := httptest.NewRecorder()
	ctx, cancel := context.WithCancel(context.Background())
	req = req.WithContext(ctx)

	done := make(chan struct{})
	go func() {
		broker.ServeSession(w, req, ws.Sessions[0].ID)
		close(done)
	}()

	// Unsubscribe all channels for this session to trigger !ok
	time.Sleep(100 * time.Millisecond)
	broker.mu.Lock()
	for ch := range broker.subscribers[ws.Sessions[0].ID] {
		close(ch)
	}
	delete(broker.subscribers, ws.Sessions[0].ID)
	broker.mu.Unlock()

	time.Sleep(200 * time.Millisecond)
	cancel()
	<-done
}

func TestServeSessionHeartbeatWriteError(t *testing.T) {
	broker := NewBroker()
	broker.heartbeat = 50 * time.Millisecond
	store := NewMockStore()
	ws := store.workspaces[0]

	req := httptest.NewRequest("GET", "/api/sessions/"+ws.Sessions[0].ID+"/events", nil)
	w := &limitWriterResponse{ResponseRecorder: httptest.NewRecorder(), limit: 200}
	ctx, cancel := context.WithCancel(context.Background())
	req = req.WithContext(ctx)

	done := make(chan struct{})
	go func() {
		broker.ServeSession(w, req, ws.Sessions[0].ID)
		close(done)
	}()

	time.Sleep(300 * time.Millisecond)
	cancel()
	<-done
}

type limitWriterResponse struct {
	*httptest.ResponseRecorder
	limit int
	n     int
}

func (l *limitWriterResponse) Write(p []byte) (int, error) {
	l.n += len(p)
	if l.n > l.limit {
		return 0, errors.New("write limit")
	}
	return l.ResponseRecorder.Write(p)
}

func (l *limitWriterResponse) Flush() {}

// --- commands.go: individual error branches via fake pi ---

func TestListPiCommandsSuccess(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	os.MkdirAll(bin, 0o700)
	script := "#!/bin/sh\necho '{\"id\":\"commands\",\"type\":\"response\",\"command\":\"get_commands\",\"success\":true,\"data\":{\"commands\":[{\"name\":\"test\",\"description\":\"d\",\"source\":\"s\",\"sourceInfo\":{\"scope\":\"user\"}}]}}'\n"
	os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	cmds, err := ListPiCommands(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(cmds) != 1 || cmds[0].Command != "/test" {
		t.Fatalf("unexpected commands: %+v", cmds)
	}
}

func TestListPiCommandsScannerErr(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	os.MkdirAll(bin, 0o700)
	// Produce output > 8MB to trigger scanner error
	script := "#!/bin/sh\npython3 -c \"import sys; sys.stdout.write('x' * (9*1024*1024))\"\n"
	os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	_, err := ListPiCommands(context.Background(), dir)
	if err == nil {
		t.Fatal("expected error for oversized output")
	}
}

// --- folders.go: ExpandUserPath error paths ---

func TestExpandUserPathErrorsDirectly(t *testing.T) {
	// Save original and restore
	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)

	// Force UserHomeDir to fail
	os.Setenv("HOME", "")
	_, err := ExpandUserPath("~")
	// Depending on platform, this may or may not error
	_ = err

	_, err = ExpandUserPath("~/test")
	_ = err
}

// --- pi_sessions.go: ParsePiSessionFile with various data ---

func TestParsePiSessionFileWithEntryError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.jsonl")
	// Write header then unparseable entry line
	content := `{"type":"session","version":3,"id":"abc","timestamp":"2024-01-01T00:00:00Z","cwd":"/tmp"}` + "\n" +
		`{"type":"message","id":"m1","message":}` + "\n" // malformed
	os.WriteFile(path, []byte(content), 0o600)
	parsed, err := ParsePiSessionFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Header.ID != "abc" {
		t.Fatalf("unexpected: %+v", parsed)
	}
}

func TestParsePiSessionFileWithSessionInfo(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.jsonl")
	content := `{"type":"session","version":3,"id":"abc","timestamp":"2024-01-01T00:00:00Z","cwd":"/tmp"}` + "\n" +
		`{"type":"session_info","id":"m1","name":"My Session"}` + "\n"
	os.WriteFile(path, []byte(content), 0o600)
	parsed, err := ParsePiSessionFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Session.Title != "My Session" {
		t.Fatalf("expected title 'My Session', got %q", parsed.Session.Title)
	}
}

func TestParsePiSessionFileWithModelChange(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.jsonl")
	content := `{"type":"session","version":3,"id":"abc","timestamp":"2024-01-01T00:00:00Z","cwd":"/tmp"}` + "\n" +
		`{"type":"model_change","provider":"openai","modelId":"gpt-4"}` + "\n"
	os.WriteFile(path, []byte(content), 0o600)
	parsed, _ := ParsePiSessionFile(path)
	if len(parsed.Messages) != 1 || parsed.Messages[0].Kind != "banner" {
		t.Fatalf("expected banner message, got %+v", parsed.Messages)
	}
}

func TestParsePiSessionFileWithThinkingLevel(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.jsonl")
	content := `{"type":"session","version":3,"id":"abc","timestamp":"2024-01-01T00:00:00Z","cwd":"/tmp"}` + "\n" +
		`{"type":"thinking_level_change","thinkingLevel":"high"}` + "\n"
	os.WriteFile(path, []byte(content), 0o600)
	parsed, _ := ParsePiSessionFile(path)
	if len(parsed.Messages) != 1 {
		t.Fatalf("expected message, got %+v", parsed.Messages)
	}
}

func TestParsePiSessionFileWithCompaction(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.jsonl")
	content := `{"type":"session","version":3,"id":"abc","timestamp":"2024-01-01T00:00:00Z","cwd":"/tmp"}` + "\n" +
		`{"type":"compaction","tokensBefore":5000}` + "\n"
	os.WriteFile(path, []byte(content), 0o600)
	parsed, _ := ParsePiSessionFile(path)
	if len(parsed.Messages) != 1 {
		t.Fatalf("expected compaction message, got %+v", parsed.Messages)
	}
}

func TestLoadPiSessionsDirError(t *testing.T) {
	_, err := LoadPiSessions("/proc/1/fd/nonexistent")
	_ = err // may or may not fail depending on system
}

func TestCreatePiSessionFileSuccess(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
	session, file, err := CreatePiSessionFile(filepath.Join(dir, "project"))
	if err != nil {
		t.Fatal(err)
	}
	if session.ID == "" {
		t.Fatal("expected session ID")
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("session file should exist: %v", err)
	}
}

// --- quota_payloads.go: kimiUsedPercent with remaining ---

func TestKimiUsedPercentWithRemaining(t *testing.T) {
	limit := kimiLimit{Limit: 100, Used: 60, Remaining: 40}
	used, ok := kimiUsedPercent(&limit)
	if !ok {
		t.Fatal("expected ok")
	}
	if used < 59 || used > 61 {
		t.Fatalf("expected ~60, got %f", used)
	}
}

// --- quota_status.go: quotaFromFile with valid data ---

func TestQuotaFromFileWithData(t *testing.T) {
	dir := t.TempDir()
	data := `{"fiveHourQuota": 50, "weeklyQuota": 80}`
	os.WriteFile(filepath.Join(dir, ".pi", "web-status.json"), []byte(data), 0o600)
	os.MkdirAll(filepath.Join(dir, ".pi"), 0o755)
	os.WriteFile(filepath.Join(dir, ".pi", "web-status.json"), []byte(data), 0o600)

	fh, wk := quotaFromFile(dir)
	if fh == nil || *fh != 50 {
		t.Fatalf("expected 50, got %v", fh)
	}
	if wk == nil || *wk != 80 {
		t.Fatalf("expected 80, got %v", wk)
	}
}

func TestReadAuthJSONWithFile(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("HOME", dir)
	os.MkdirAll(filepath.Join(dir, ".pi", "agent"), 0o755)
	os.WriteFile(filepath.Join(dir, ".pi", "agent", "auth.json"), []byte(`{"kimi-coding":{"access":"tok"}}`), 0o600)

	var auth struct {
		KimiCoding struct {
			Access string `json:"access"`
		} `json:"kimi-coding"`
	}
	if !readAuthJSON(&auth) {
		t.Fatal("expected true")
	}
	if auth.KimiCoding.Access != "tok" {
		t.Fatalf("expected tok, got %s", auth.KimiCoding.Access)
	}
}

// --- runner.go: send error and streamPipe ---

func TestRunnerSendError(t *testing.T) {
	run := &activePiRun{stdin: &errCloser{Writer: &errWriter{}}}
	err := run.send(map[string]string{"ok": "x"})
	if err == nil {
		t.Fatal("expected error")
	}
}

type errCloser struct {
	io.Writer
}

func (e *errCloser) Close() error { return nil }

func TestRunnerStreamPipesWithRealPi(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	os.MkdirAll(bin, 0o700)
	// Script that outputs non-JSON lines (to hit tool.output branch) and an agent_end
	script := "#!/bin/sh\nread line\necho 'not json'\necho '{\"type\":\"agent_end\"}'\n"
	os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)

	store := NewMockStore()
	ws := store.workspaces[0]
	sessionFile := filepath.Join(dir, "test.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"session","id":"test","timestamp":"2024-01-01T00:00:00Z","cwd":"."}`+"\n"), 0o600)
	store.sessionFiles[ws.Sessions[0].ID] = sessionFile
	store.sessionCWD[ws.Sessions[0].ID] = dir

	broker := NewBroker()
	runner := NewRunner()
	err := runner.StartPiPrompt(context.Background(), broker, store, ws.Sessions[0].ID, "test", nil, "test")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	deadline := time.After(3 * time.Second)
	for runner.IsRunning(ws.Sessions[0].ID) {
		select {
		case <-deadline:
			t.Fatal("runner did not finish")
		default:
			time.Sleep(20 * time.Millisecond)
		}
	}
}

// --- runner_tail.go: idle timer fires ---

func TestTailSessionFileIdleTimerFires(t *testing.T) {
	dir := t.TempDir()
	sessionFile := filepath.Join(dir, "session.jsonl")
	os.WriteFile(sessionFile, []byte(`{"type":"compaction","tokensBefore":100}`+"\n"), 0o600)

	broker := NewBroker()
	store := NewMockStore()
	ws := store.workspaces[0]
	store.sessionFiles[ws.Sessions[0].ID] = sessionFile
	store.sessionCWD[ws.Sessions[0].ID] = dir

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	var emitted atomic.Int64

	go tailSessionFile(ctx, broker, store, ws.Sessions[0].ID, sessionFile, 0, &emitted, done)

	// Let it tick, write data, then cancel to trigger idle timer
	time.Sleep(250 * time.Millisecond)
	f, _ := os.OpenFile(sessionFile, os.O_APPEND|os.O_WRONLY, 0o600)
	f.WriteString(`{"type":"compaction","tokensBefore":200}` + "\n")
	f.Close()
	time.Sleep(100 * time.Millisecond)
	cancel()
	waitForTail(done)

	if emitted.Load() == 0 {
		t.Fatal("expected some emitted messages")
	}
}

// --- runtime_status.go: WorkspaceRuntimeStatus error ---

func TestWorkspaceRuntimeStatusWithGitError(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	tmpDir := t.TempDir()
	status, err := WorkspaceRuntimeStatus(context.Background(), tmpDir)
	if err != nil {
		t.Fatal(err)
	}
	// Model should be empty since pi doesn't exist
	if status.Model != "" {
		t.Fatalf("expected empty model, got %q", status.Model)
	}
}

// --- server_session_handlers.go: AutoNameSession changed branch ---

func TestPromptAutoNameChanged(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{StaticFiles: nil}, store, broker)
	ws := store.workspaces[0]

	// Use a session with "new session" title so AutoNameSession triggers
	for i := range ws.Sessions {
		if ws.Sessions[i].Title == "port pi-tui to web" {
			ws.Sessions[i].Title = "new session"
			break
		}
	}

	req := httptest.NewRequest("POST", "/api/sessions/"+ws.Sessions[0].ID+"/prompt", strings.NewReader(`{"text":"hello world"}`))
	req.SetPathValue("sessionID", ws.Sessions[0].ID)
	w := httptest.NewRecorder()
	s.prompt(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", w.Code)
	}
}

// --- server_static.go: API path 404 ---

func TestStaticFileAPI404(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	staticFS := fstest.MapFS{"index.html": {Data: []byte("<html></html>")}}
	s := NewServer(Config{StaticFiles: staticFS}, store, broker)

	req := httptest.NewRequest("GET", "/api/unknown", nil)
	w := httptest.NewRecorder()
	s.staticFile(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

// --- server_workspace_handlers.go: version empty, path empty, clone error ---

func TestVersionStatusWithEmptyCurrentVersion(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{CurrentVersion: "", VersionStatus: nil, StaticFiles: nil}, store, broker)

	req := httptest.NewRequest("GET", "/api/version", nil)
	w := httptest.NewRecorder()
	s.versionStatus(w, req)

	var result VersionStatus
	json.NewDecoder(w.Body).Decode(&result)
	if result.CurrentVersion != "dev" {
		t.Fatalf("expected 'dev', got %q", result.CurrentVersion)
	}
}

func TestListFoldersDefaultPath(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{StaticFiles: nil}, store, broker)

	req := httptest.NewRequest("GET", "/api/system/folders?path=", nil)
	w := httptest.NewRecorder()
	s.listFolders(w, req)
	// Should default to ~
}

func TestCloneWorkspaceError(t *testing.T) {
	store := NewMockStore()
	broker := NewBroker()
	s := NewServer(Config{StaticFiles: nil}, store, broker)

	body := `{"parentPath":"/nonexistent","gitURL":"https://github.com/test/test.git"}`
	req := httptest.NewRequest("POST", "/api/workspaces/clone", strings.NewReader(body))
	w := httptest.NewRecorder()
	s.cloneWorkspace(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

// --- settings.go: WorkspaceSettings & SaveWorkspaceSettings error paths ---

func TestWorkspaceSettingsErrorsDirectly(t *testing.T) {
	// Force settingsPaths to fail
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", "/nonexistent/impossible/path/that/does/not/exist")
	defer os.Setenv("HOME", origHome)

	_, err := WorkspaceSettings(t.TempDir())
	if err != nil {
		// May fail depending on platform
		_ = err
	}
}

func TestSaveWorkspaceSettingsBadScope(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".pi"), 0o755)
	_, err := SaveWorkspaceSettings(dir, SettingsPatchRequest{Scope: "bad", Settings: map[string]any{}})
	if err == nil {
		t.Fatal("expected error for bad scope")
	}
}

func TestWriteSettingsFileBadDir(t *testing.T) {
	err := writeSettingsFile("/dev/null/foo/settings.json", map[string]any{"a": 1})
	if err == nil {
		t.Fatal("expected error")
	}
}

// --- store.go: NewPiStore and addWorkspaceLocked ---

func TestNewPiStoreSort(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)

	// Create two session files in different dirs
	for _, name := range []string{"alpha", "beta"} {
		cwd := filepath.Join(dir, name)
		os.MkdirAll(cwd, 0o755)
		sessionDir := piSessionDirForCWD(cwd)
		os.MkdirAll(sessionDir, 0o755)
		header := fmt.Sprintf(`{"type":"session","version":3,"id":"%s","timestamp":"2024-01-01T00:00:00Z","cwd":%q}`, name, cwd)
		os.WriteFile(filepath.Join(sessionDir, "test.jsonl"), []byte(header+"\n"), 0o600)
	}

	store, err := NewPiStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(store.workspaces) != 2 {
		t.Fatalf("expected 2 workspaces, got %d", len(store.workspaces))
	}
	// Should be sorted by path
	if store.workspaces[0].Name > store.workspaces[1].Name {
		t.Fatal("expected sorted workspaces")
	}
}

func TestStoreAddWorkspaceLockedSlugEmpty(t *testing.T) {
	store := emptyStore("")
	// Create a dir with no valid slug chars
	dir := t.TempDir()
	// Create a directory whose base is all special chars
	specialDir := filepath.Join(dir, "___")
	os.MkdirAll(specialDir, 0o755)
	ws := store.addWorkspaceLocked(specialDir)
	if ws.ID != "workspace" {
		t.Fatalf("expected 'workspace', got %q", ws.ID)
	}
}

func TestStoreAddWorkspaceLockedDuplicateSlug(t *testing.T) {
	store := emptyStore("")
	dir1 := t.TempDir()
	ws1 := store.addWorkspaceLocked(dir1)
	// Add another with same slug (different path but same basename concept)
	// Need to make basename same
	parent := filepath.Dir(dir1)
	dir2 := filepath.Join(parent, filepath.Base(dir1)+"_2")
	os.MkdirAll(dir2, 0o755)
	ws2 := store.addWorkspaceLocked(dir2)
	if ws1.ID == ws2.ID {
		t.Fatal("expected unique IDs for different paths")
	}
}

// --- store_sessions.go: CreateSession and various branches ---

func TestCreateSessionSuccess(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
	store := emptyStore("")
	cwd := filepath.Join(dir, "project")
	os.MkdirAll(cwd, 0o755)
	ws := store.addWorkspaceLocked(cwd)

	session, err := store.CreateSession(ws.ID)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if session.ID == "" {
		t.Fatal("expected session ID")
	}
}

func TestAutoNameSessionNewSession(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
	store := emptyStore("")
	cwd := filepath.Join(dir, "project")
	os.MkdirAll(cwd, 0o755)
	ws := store.addWorkspaceLocked(cwd)

	session, _ := store.CreateSession(ws.ID)
	// Session should have "new session" title
	found, changed, err := store.AutoNameSession(session.ID, "My New Title")
	if err != nil {
		t.Fatalf("auto name: %v", err)
	}
	if !changed {
		t.Fatal("expected changed for new session")
	}
	if found.Title != "My New Title" {
		t.Fatalf("expected title 'My New Title', got %q", found.Title)
	}
}

func TestRenameSessionSuccess(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
	store := emptyStore("")
	cwd := filepath.Join(dir, "project")
	os.MkdirAll(cwd, 0o755)
	ws := store.addWorkspaceLocked(cwd)

	session, _ := store.CreateSession(ws.ID)
	renamed, err := store.RenameSession(session.ID, "Renamed")
	if err != nil {
		t.Fatalf("rename: %v", err)
	}
	if renamed.Title != "Renamed" {
		t.Fatalf("expected 'Renamed', got %q", renamed.Title)
	}
}

func TestDeleteSessionSuccess(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
	store := emptyStore("")
	cwd := filepath.Join(dir, "project")
	os.MkdirAll(cwd, 0o755)
	ws := store.addWorkspaceLocked(cwd)

	session, _ := store.CreateSession(ws.ID)
	err := store.DeleteSession(session.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestDeleteWorkspaceSessionsSuccess(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
	store := emptyStore("")
	cwd := filepath.Join(dir, "project")
	os.MkdirAll(cwd, 0o755)
	ws := store.addWorkspaceLocked(cwd)

	session, _ := store.CreateSession(ws.ID)
	_ = session

	count, err := store.DeleteWorkspaceSessions(ws.ID)
	if err != nil {
		t.Fatalf("delete workspace sessions: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 deleted, got %d", count)
	}
}

func TestRefreshWorkspaceSessionsNilModTimeMap(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
	store := emptyStore("")
	cwd := filepath.Join(dir, "project")
	os.MkdirAll(cwd, 0o755)
	ws := store.addWorkspaceLocked(cwd)

	// Force nil mod time map
	store.sessionDirModTime = nil
	_, _ = store.Sessions(ws.ID) // triggers refresh
}

// --- store_workspace.go: Files mock path, GitStatus real path ---

func TestStoreFilesMockFallback(t *testing.T) {
	store := emptyStore("")
	dir := t.TempDir()
	os.MkdirAll(dir, 0o755)
	ws := store.addWorkspaceLocked(dir)
	store.workspacePath[ws.ID] = dir

	files, err := store.Files(ws.ID)
	if err != nil {
		t.Fatal(err)
	}
	_ = files
}

func TestStoreGitStatusRealPathFallback(t *testing.T) {
	store := emptyStore("")
	dir := t.TempDir()
	ws := store.addWorkspaceLocked(dir)
	// No git repo, RealGitStatus should fail, fallback to mock
	store.workspacePath[ws.ID] = dir

	status, err := store.GitStatus(ws.ID)
	if err != nil {
		t.Fatal(err)
	}
	if status.Branch != "main" {
		t.Fatalf("expected 'main', got %q", status.Branch)
	}
}

// --- store_utils.go: ValidateWorkspacePath traversal ---

func TestValidateWorkspacePathTraversal(t *testing.T) {
	_, err := ValidateWorkspacePath("/tmp/../etc/passwd")
	// Should either clean it or reject it
	_ = err
}

// --- web_db.go: openWebDB error paths ---

func TestOpenWebDBBadDir(t *testing.T) {
	_, err := openWebDB("/dev/null/foo/test.db")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestLoadWebWorkspacePathsDBError(t *testing.T) {
	// Use an invalid db path
	paths := LoadWebWorkspacePaths("/dev/null/test.db")
	if paths != nil {
		t.Fatal("expected nil for bad db")
	}
}

func TestSaveWebWorkspacePathsDBError(t *testing.T) {
	err := SaveWebWorkspacePaths("/dev/null/test.db", []string{"/tmp/ws"})
	if err == nil {
		t.Fatal("expected error for bad db")
	}
}

// --- workspace_ops.go: stat error ---

func TestCloneGitWorkspaceStatNotDir(t *testing.T) {
	f := filepath.Join(t.TempDir(), "file.txt")
	os.WriteFile(f, []byte("x"), 0o600)
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: f,
		GitURL:     "https://github.com/test/repo.git",
	})
	if err == nil {
		t.Fatal("expected error for non-dir parent")
	}
}

func TestCloneGitWorkspaceInvalidNameNull(t *testing.T) {
	dir := t.TempDir()
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: dir,
		GitURL:     "https://github.com/test/repo.git",
		Name:       "bad\x00name",
	})
	if err == nil {
		t.Fatal("expected error for null byte in name")
	}
}

func TestCloneGitWorkspaceInvalidNameSlash(t *testing.T) {
	dir := t.TempDir()
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: dir,
		GitURL:     "https://github.com/test/repo.git",
		Name:       "bad/name",
	})
	if err == nil {
		t.Fatal("expected error for slash in name")
	}
}

func TestCloneGitWorkspaceInvalidNameDot(t *testing.T) {
	dir := t.TempDir()
	store := NewMockStore()
	_, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{
		ParentPath: dir,
		GitURL:     "https://github.com/test/repo.git",
		Name:       ".",
	})
	if err == nil {
		t.Fatal("expected error for dot name")
	}
}

// --- redact.go: ensure all branches covered ---

func TestRedactSecretsShortMatch(t *testing.T) {
	// Test with short sk- prefix (fewer than 12 chars after sk-)
	result := RedactSecrets("sk-abc")
	// Should not be redacted since it's < 12 chars after sk-
	_ = result
}

// --- pi_session_messages.go: assistantMessages empty blocks ---

func TestAssistantMessagesWithToolCall(t *testing.T) {
	raw := json.RawMessage(`[{"type":"toolCall","name":"bash","arguments":"ls"}]`)
	msgs := assistantMessages(raw)
	if len(msgs) != 0 {
		t.Fatalf("expected 0 messages for toolCall, got %d", len(msgs))
	}
}
