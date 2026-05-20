package piweb

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestCoverageStoreWorkspaceFilesAndCommands(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	dbPath := filepath.Join(t.TempDir(), "pi-web.db")
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "dir"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "dir", "b.txt"), []byte("nested"), 0o600); err != nil {
		t.Fatal(err)
	}

	store := NewWebStore(dbPath)
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := store.Workspaces(); len(got) != 1 || got[0].ID != workspace.ID {
		t.Fatalf("unexpected workspaces: %+v", got)
	}
	if _, err := store.OpenWorkspace(""); err == nil {
		t.Fatal("expected invalid open path error")
	}
	if path, err := store.WorkspacePath(workspace.ID); err != nil || path != root {
		t.Fatalf("workspace path=%q err=%v", path, err)
	}
	if _, err := store.WorkspacePath("missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}

	files, err := store.Files(workspace.ID)
	if err != nil || len(files) == 0 {
		t.Fatalf("files=%+v err=%v", files, err)
	}
	content, err := store.ReadFile(workspace.ID, "a.txt")
	if err != nil || content.Content != "old" {
		t.Fatalf("read=%+v err=%v", content, err)
	}
	content, err = store.WriteFile(workspace.ID, "a.txt", "new")
	if err != nil || content.Content != "new" {
		t.Fatalf("write=%+v err=%v", content, err)
	}
	if _, err := store.ReadFile("missing", "a.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected read not found, got %v", err)
	}
	if _, err := store.WriteFile("missing", "a.txt", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected write not found, got %v", err)
	}
	if _, err := store.ReadFile(workspace.ID, "../secret"); err == nil {
		t.Fatal("expected traversal read error")
	}
	if _, err := store.WriteFile(workspace.ID, "dir", "x"); err == nil {
		t.Fatal("expected directory write error")
	}

	status, err := store.GitStatus(workspace.ID)
	if err != nil || status.Branch != "main" || status.Dirty != 3 {
		t.Fatalf("fallback git status=%+v err=%v", status, err)
	}
	if _, err := store.GitStatus("missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected git not found, got %v", err)
	}

	res, err := RunWorkspaceShellCommand(context.Background(), store, workspace.ID, "printf ok")
	if err != nil || res.Output != "ok" || res.ExitCode != 0 {
		t.Fatalf("shell success=%+v err=%v", res, err)
	}
	res, err = RunWorkspaceShellCommand(context.Background(), store, workspace.ID, "printf bad && exit 7")
	if err != nil || res.ExitCode != 7 || res.Output != "bad" {
		t.Fatalf("shell exit=%+v err=%v", res, err)
	}
	if _, err := RunWorkspaceShellCommand(context.Background(), store, workspace.ID, " "); err == nil {
		t.Fatal("expected blank command error")
	}
	if _, err := RunWorkspaceShellCommand(context.Background(), store, "missing", "true"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected shell not found, got %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Nanosecond)
	defer cancel()
	time.Sleep(time.Millisecond)
	res, err = RunWorkspaceShellCommand(ctx, store, workspace.ID, "sleep 1")
	if err != nil || res.ExitCode != -1 || !strings.Contains(res.Output, "timed out") {
		t.Fatalf("shell timeout=%+v err=%v", res, err)
	}

	if err := store.DeleteWorkspace(workspace.ID); err != nil {
		t.Fatalf("delete workspace: %v", err)
	}
	if err := store.DeleteWorkspace(workspace.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected delete not found, got %v", err)
	}
}

func TestCoverageWebDBAndWorkspaceOps(t *testing.T) {
	sessionRoot := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", filepath.Join(sessionRoot, "sessions"))
	if got := DefaultWebDBPath(); got != filepath.Join(sessionRoot, "pi-web.db") {
		t.Fatalf("unexpected default db path: %q", got)
	}
	if paths := LoadWebWorkspacePaths(""); paths != nil {
		t.Fatalf("expected nil paths, got %+v", paths)
	}
	if err := SaveWebWorkspacePaths("", []string{"x"}); err != nil {
		t.Fatalf("empty save path: %v", err)
	}
	dbPath := filepath.Join(t.TempDir(), "db", "pi-web.db")
	a := filepath.Join(t.TempDir(), "a")
	b := filepath.Join(t.TempDir(), "b")
	if err := SaveWebWorkspacePaths(dbPath, []string{a, b}); err != nil {
		t.Fatal(err)
	}
	if got := LoadWebWorkspacePaths(dbPath); len(got) != 2 || !containsString(got, a) || !containsString(got, b) {
		t.Fatalf("unexpected loaded paths: %+v", got)
	}
	if err := SaveWebWorkspacePaths(dbPath, []string{b}); err != nil {
		t.Fatal(err)
	}
	if got := LoadWebWorkspacePaths(dbPath); len(got) != 1 || got[0] != b {
		t.Fatalf("expected hidden old path, got %+v", got)
	}
	badParent := filepath.Join(t.TempDir(), "file", "db.sqlite")
	if err := os.WriteFile(filepath.Dir(badParent), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if paths := LoadWebWorkspacePaths(badParent); paths != nil {
		t.Fatalf("expected nil on bad db path, got %+v", paths)
	}
	if err := SaveWebWorkspacePaths(badParent, []string{a}); err == nil {
		t.Fatal("expected save bad db path error")
	}

	for raw, want := range map[string]string{
		"https://github.com/owner/repo.git": "repo",
		"git@github.com:owner/repo.git":     "repo",
		"https://github.com/owner/repo/":    "repo",
		" ":                                 ".",
	} {
		if got := repoNameFromGitURL(raw); got != want {
			t.Fatalf("repoNameFromGitURL(%q)=%q want %q", raw, got, want)
		}
	}

	store := emptyStore("")
	parent := t.TempDir()
	if _, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{ParentPath: filepath.Join(parent, "missing"), GitURL: "x"}); err == nil {
		t.Fatal("expected missing parent error")
	}
	if _, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{ParentPath: parent}); err == nil {
		t.Fatal("expected empty git url error")
	}
	if _, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{ParentPath: parent, GitURL: "https://x/repo.git", Name: "../bad"}); err == nil {
		t.Fatal("expected invalid destination error")
	}
	if err := os.Mkdir(filepath.Join(parent, "repo"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, _, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{ParentPath: parent, GitURL: "https://x/repo.git", Name: "repo"}); err == nil {
		t.Fatal("expected destination exists error")
	}
	if _, output, err := CloneGitWorkspace(context.Background(), store, CloneWorkspaceRequest{ParentPath: parent, GitURL: "not-a-repo", Name: "other"}); err == nil || output == "" {
		t.Fatalf("expected clone failure with output, output=%q err=%v", output, err)
	}
}

func TestCoverageServerHandlers(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "file.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{
		CurrentVersion: "1.0.0",
		VersionStatus:  func(context.Context, string) (VersionStatus, error) { return VersionStatus{}, errors.New("version") },
	}, store, NewBroker())
	h := server.Handler()

	for _, tc := range []struct {
		method string
		path   string
		body   string
		code   int
	}{
		{http.MethodOptions, "/api/health", "", http.StatusNoContent},
		{http.MethodGet, "/api/version", "", http.StatusOK},
		{http.MethodGet, "/api/system/folders?path=" + root, "", http.StatusOK},
		{http.MethodGet, "/api/system/folders?path=" + filepath.Join(root, "missing"), "", http.StatusBadRequest},
		{http.MethodGet, "/api/workspaces", "", http.StatusOK},
		{http.MethodPost, "/api/workspaces/open", `{bad`, http.StatusBadRequest},
		{http.MethodPost, "/api/workspaces/open", `{"path":"` + root + `"}`, http.StatusOK},
		{http.MethodPost, "/api/workspaces/open", `{"path":""}`, http.StatusBadRequest},
		{http.MethodPost, "/api/workspaces/clone", `{bad`, http.StatusBadRequest},
		{http.MethodPost, "/api/workspaces/clone", `{"parentPath":"` + root + `","gitUrl":""}`, http.StatusBadRequest},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/sessions", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/missing/sessions", "", http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/files", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/missing/files", "", http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/missing/commands", "", http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/runtime-status", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/missing/runtime-status", "", http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/runtime-model", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/missing/runtime-model", "", http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/runtime-quota?model=x", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/missing/runtime-quota", "", http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/missing/settings", "", http.StatusNotFound},
		{http.MethodPut, "/api/workspaces/missing/settings", `{}`, http.StatusNotFound},
		{http.MethodPut, "/api/workspaces/" + workspace.ID + "/settings", `{bad`, http.StatusBadRequest},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/files/read?path=file.txt", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/missing/files/read?path=file.txt", "", http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/files/read?path=../x", "", http.StatusInternalServerError},
		{http.MethodPut, "/api/workspaces/" + workspace.ID + "/files/write?path=file.txt", `{bad`, http.StatusBadRequest},
		{http.MethodPut, "/api/workspaces/" + workspace.ID + "/files/write?path=file.txt", `{"content":"updated"}`, http.StatusOK},
		{http.MethodPut, "/api/workspaces/missing/files/write?path=file.txt", `{"content":"x"}`, http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/git/status", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/missing/git/status", "", http.StatusNotFound},
		{http.MethodPost, "/api/workspaces/" + workspace.ID + "/shell", `{bad`, http.StatusBadRequest},
		{http.MethodPost, "/api/workspaces/" + workspace.ID + "/shell", `{"command":"printf ok"}`, http.StatusOK},
		{http.MethodPost, "/api/workspaces/missing/shell", `{"command":"true"}`, http.StatusNotFound},
	} {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			res := httptest.NewRecorder()
			h.ServeHTTP(res, req)
			if res.Code != tc.code {
				t.Fatalf("expected %d, got %d: %s", tc.code, res.Code, res.Body.String())
			}
		})
	}

	delReq := httptest.NewRequest(http.MethodDelete, "/api/workspaces/"+workspace.ID, nil)
	delRes := httptest.NewRecorder()
	h.ServeHTTP(delRes, delReq)
	if delRes.Code != http.StatusOK {
		t.Fatalf("delete workspace: %d %s", delRes.Code, delRes.Body.String())
	}
	delRes = httptest.NewRecorder()
	h.ServeHTTP(delRes, delReq)
	if delRes.Code != http.StatusNotFound {
		t.Fatalf("delete missing workspace: %d %s", delRes.Code, delRes.Body.String())
	}

	writeStoreError(httptest.NewRecorder(), ErrNotFound)
	writeStoreError(httptest.NewRecorder(), errors.New("boom"))
	if server.Addr() == "" {
		t.Fatal("expected server addr")
	}
}

func TestCoverageParsersQuotaAndRuntime(t *testing.T) {
	if msg, ok := ParsePiSessionLine(""); ok || msg.Kind != "" {
		t.Fatalf("unexpected empty parse: %+v %v", msg, ok)
	}
	line := `{"type":"message","message":{"role":"user","content":[{"type":"text","text":"hi"},{"type":"image","data":"abc","mimeType":"image/jpeg"}]}}`
	msg, ok := ParsePiSessionLine(line)
	if !ok || msg.Kind != "user" || len(msg.Attachments) != 1 {
		t.Fatalf("unexpected user parse: %+v %v", msg, ok)
	}
	cases := []string{
		`{"type":"compaction","tokensBefore":123}`,
		`{"type":"model_change","provider":"p","modelId":"m"}`,
		`{"type":"thinking_level_change","thinkingLevel":"high"}`,
		`{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"hello"},{"type":"thinking","thinking":"why"},{"type":"toolCall"},{"type":"text","text":"done"}]}}`,
		`{"type":"message","message":{"role":"toolResult","toolName":"read","isError":true,"content":"bad"}}`,
		`{"type":"message","message":{"role":"bashExecution","command":"ls","exitCode":1,"output":"no"}}`,
		`{"type":"message","message":{"role":"custom","content":"note"}}`,
	}
	for _, raw := range cases {
		if got := ParsePiSessionLineMessages(raw); len(got) == 0 {
			t.Fatalf("expected messages for %s", raw)
		}
	}
	if got := ParsePiSessionLineMessages(`{"type":"unknown"}`); got != nil {
		t.Fatalf("unexpected unknown parse: %+v", got)
	}
	if trimTitle(strings.Repeat("x", 60)) == strings.Repeat("x", 60) {
		t.Fatal("expected trimmed title")
	}
	for _, at := range []time.Time{time.Now(), time.Now().Add(-2 * time.Minute), time.Now().Add(-2 * time.Hour), time.Now().Add(-48 * time.Hour), time.Now().Add(-40 * 24 * time.Hour)} {
		if relTime(at) == "" {
			t.Fatal("empty rel time")
		}
	}
	if workspaceIDFromPath("/tmp/My Project") != "my-project" {
		t.Fatal("unexpected workspace id")
	}

	if got := remainingFromWindow(&quotaUsageWindow{UsedPercent: 12.2}); got == nil || *got != 88 {
		t.Fatalf("remaining window=%v", got)
	}
	if remainingFromWindow(nil) != nil || remainingFromWindow(&quotaUsageWindow{UsedPercent: struct{}{}}) != nil {
		t.Fatal("expected nil remaining")
	}
	payload := kimiUsagePayload{Limits: []kimiLimit{
		{Label: "5H", UsedPercent: 0.2},
		{Name: "weekly", Detail: &kimiLimit{Limit: 100, Used: 30}},
	}}
	if got := kimiWindow(&payload, "5H:"); got == nil || *got != 80 {
		t.Fatalf("kimi 5h=%v", got)
	}
	if got := kimiWindow(&payload, "7D:"); got == nil || *got != 70 {
		t.Fatalf("kimi weekly=%v", got)
	}
	payload = kimiUsagePayload{Usage: &kimiLimit{Limit: 100, Remaining: 40}}
	if got := kimiWindow(&payload, "5H:"); got == nil || *got != 40 {
		t.Fatalf("kimi usage=%v", got)
	}
	if kimiWindow(&kimiUsagePayload{}, "5H:") != nil {
		t.Fatal("expected nil kimi")
	}
	for _, window := range []*quotaWindow{{Duration: 2, Unit: "hours"}, {Duration: 1, Unit: "days"}, {Duration: 61, Unit: "seconds"}, {Minutes: json.Number("15")}} {
		if quotaWindowMinutes(window) == 0 {
			t.Fatalf("unexpected window minutes for %+v", window)
		}
	}
	if quotaWindowMinutes(nil) != 0 || quotaWindowMinutes(&quotaWindow{Duration: struct{}{}}) != 0 {
		t.Fatal("expected zero window minutes")
	}
	zai := zaiQuotaPayload{Limits: []zaiLimit{{Type: "TOKENS_LIMIT", Percentage: 25}, {UsedPercentage: "50"}}}
	if got := zaiWindow(&zai, "5H:"); got == nil || *got != 75 {
		t.Fatalf("zai 5h=%v", got)
	}
	if got := zaiWindow(&zai, "7D:"); got == nil || *got != 50 {
		t.Fatalf("zai 7d=%v", got)
	}
	if zaiWindow(&zaiQuotaPayload{}, "5H:") != nil {
		t.Fatal("expected nil zai")
	}
	for _, value := range []any{float64(1), 1, json.Number("1.5"), " 2 "} {
		if _, ok := numberFromAny(value); !ok {
			t.Fatalf("expected number for %#v", value)
		}
	}
	if _, ok := numberFromAny("x"); ok {
		t.Fatal("unexpected number")
	}

	t.Setenv("PI_WEB_5H_QUOTA", "-1")
	t.Setenv("PI_WEB_WEEKLY_QUOTA", "101")
	five, weekly := RuntimeQuota(t.TempDir())
	if five == nil || *five != 0 || weekly == nil || *weekly != 100 {
		t.Fatalf("env quota five=%v weekly=%v", five, weekly)
	}
	five, weekly = LiveQuotaForModel(context.Background(), "unknown")
	if five != nil || weekly != nil {
		t.Fatalf("expected nil live quota")
	}
	if firstNonEmpty("", " x ") != "x" || firstNonEmpty("", " ") != "" {
		t.Fatal("firstNonEmpty failed")
	}
	if bearerHeaders("tok")["Authorization"] != "Bearer tok" {
		t.Fatal("bearerHeaders failed")
	}
}

func TestCoverageBrokerSettingsSessionsAndHelpers(t *testing.T) {
	broker := NewBroker()
	broker.buffer = 1
	broker.historySize = 1
	events, unsubscribe := broker.Subscribe("s")
	broker.Publish("s", "one", map[string]string{"token": "abc123456789"})
	broker.Publish("s", "two", "authorization: bearer secret")
	select {
	case <-events:
	default:
		t.Fatal("expected subscribed event")
	}
	unsubscribe()
	unsubscribe()
	if got := broker.Replay("s", 0); len(got) != 1 || got[0].Type != "two" {
		t.Fatalf("unexpected replay: %+v", got)
	}
	plain := &plainResponseWriter{header: http.Header{}}
	req := httptest.NewRequest(http.MethodGet, "/events?replay=false", nil)
	broker.ServeSession(plain, req, "s")
	if plain.code != http.StatusInternalServerError {
		t.Fatalf("expected no flusher error, got %d", plain.code)
	}
	var out bytes.Buffer
	if err := WriteSSE(&out, Event{ID: 1, Type: "x", Payload: map[string]any{"k": "v"}}); err != nil || !strings.Contains(out.String(), "event: x") {
		t.Fatalf("write sse out=%q err=%v", out.String(), err)
	}
	if err := WriteSSE(errWriter{}, Event{ID: 1, Type: "x"}); err == nil {
		t.Fatal("expected sse writer error")
	}
	bad := Event{Payload: make(chan int)}
	if err := WriteSSE(io.Discard, bad); err == nil {
		t.Fatal("expected sse marshal error")
	}

	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	broker.PublishMockPrompt(ctx, store, session.ID, "cancelled")
	ctx, cancel = context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	fast := NewBroker()
	fast.PublishMockPrompt(ctx, store, session.ID, "mock")
	if messages := fast.Replay(session.ID, 0); len(messages) == 0 {
		t.Fatal("expected mock events")
	}

	home := t.TempDir()
	t.Setenv("HOME", home)
	root := t.TempDir()
	if _, err := WorkspaceSettings(root); err != nil {
		t.Fatalf("workspace settings missing files: %v", err)
	}
	if _, err := settingsPathForScope(SettingsPaths{}, "bad"); err == nil {
		t.Fatal("expected bad settings scope")
	}
	if err := os.MkdirAll(filepath.Join(home, ".pi", "agent"), 0o700); err != nil {
		t.Fatal(err)
	}
	global := filepath.Join(home, ".pi", "agent", "settings.json")
	if err := os.WriteFile(global, []byte(`bad`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readSettingsFile(global); err == nil {
		t.Fatal("expected settings parse error")
	}
	if err := os.WriteFile(global, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if settings, err := readSettingsFile(global); err != nil || len(settings) != 0 {
		t.Fatalf("empty settings=%+v err=%v", settings, err)
	}
	fileAsDir := filepath.Join(t.TempDir(), "file", "settings.json")
	if err := os.WriteFile(filepath.Dir(fileAsDir), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeSettingsFile(fileAsDir, map[string]any{"x": 1}); err == nil {
		t.Fatal("expected write mkdir error")
	}
	if _, err := SaveWorkspaceSettings(root, SettingsPatchRequest{Scope: "bad"}); err == nil {
		t.Fatal("expected save bad scope")
	}

	if got := RedactSecrets(`api_key="secret" Authorization: Bearer tok sk-abcdefghijkl`); strings.Contains(got, "secret") || strings.Contains(got, "tok") || strings.Contains(got, "abcdefghijkl") {
		t.Fatalf("not redacted: %s", got)
	}
	payload := RedactPayload(map[string]any{"m": Message{Text: "password: p"}, "s": "token=x"}).(map[string]any)
	if strings.Contains(payload["s"].(string), "x") {
		t.Fatalf("payload not redacted: %+v", payload)
	}

	if !isLikelyText(nil) || isLikelyText([]byte{0xff}) || isLikelyText([]byte{0}) || isLikelyText([]byte{1, 2, 3, 4, 5, 6}) {
		t.Fatal("isLikelyText branches failed")
	}
	if detectPreviewMIME("README", []byte("hello")) != "text/plain" {
		t.Fatal("expected plain text mime")
	}
	if previewKindForMIME("application/octet-stream") != "unsupported" || previewKindForMIME("image/svg+xml") != "image" {
		t.Fatal("preview kind failed")
	}

	sessionDir := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", sessionDir)
	if DefaultPiSessionDir() != sessionDir {
		t.Fatal("env session dir ignored")
	}
	if _, err := LoadPiSessions(""); err == nil {
		t.Fatal("expected empty session dir error")
	}
	if _, err := LoadPiSessions(filepath.Join(sessionDir, "missing")); err != nil {
		t.Fatalf("missing dir should be ignored by walk: %v", err)
	}
	created, path, err := CreatePiSessionFile(root)
	if err != nil || created.ID == "" || path == "" {
		t.Fatalf("create pi session=%+v path=%q err=%v", created, path, err)
	}
	if err := os.WriteFile(path, []byte(`
{"bad":
{"type":"session_info","name":"named"}
{"type":"message","message":{"role":"user","content":"hello"}}
{"type":"compaction","tokensBefore":1}
{"type":"model_change","provider":"p","modelId":"m"}
{"type":"thinking_level_change","thinkingLevel":"low"}
`), 0o600); err != nil {
		t.Fatal(err)
	}
	parsed, err := ParsePiSessionFile(path)
	if err != nil || parsed.Session.Title != "named" || len(parsed.Messages) < 4 {
		t.Fatalf("parsed=%+v err=%v", parsed, err)
	}
	if _, err := ParsePiSessionFile(filepath.Join(sessionDir, "missing.jsonl")); err == nil {
		t.Fatal("expected parse missing error")
	}
	if !sessionCreatedAfter(ParsedSession{CreatedAt: time.Now(), File: "b"}, ParsedSession{CreatedAt: time.Now().Add(-time.Second), File: "a"}) {
		t.Fatal("sessionCreatedAfter time failed")
	}
	same := time.Now()
	if !sessionCreatedAfter(ParsedSession{CreatedAt: same, File: "b"}, ParsedSession{CreatedAt: same, File: "a"}) {
		t.Fatal("sessionCreatedAfter file failed")
	}
	if len(createSessionID()) == 0 {
		t.Fatal("empty session id")
	}
}

type plainResponseWriter struct {
	header http.Header
	code   int
}

func (w *plainResponseWriter) Header() http.Header { return w.header }
func (w *plainResponseWriter) Write(data []byte) (int, error) {
	if w.code == 0 {
		w.code = http.StatusOK
	}
	return len(data), nil
}
func (w *plainResponseWriter) WriteHeader(code int) { w.code = code }

func TestCoverageMoreServerAndStoreBranches(t *testing.T) {
	sessionRoot := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", filepath.Join(sessionRoot, "sessions"))
	root := t.TempDir()
	writeFakePi(t, root, `#!/bin/sh
while IFS= read -r line; do
  case "$line" in
    *get_commands*) echo '{"id":"commands","type":"response","command":"get_commands","success":true,"data":{"commands":[{"name":"x","location":"project","path":"/tmp/x"}]}}' ;;
    *get_state*) echo '{"id":"state","type":"response","command":"get_state","success":true,"data":{"model":{"id":"gpt-test"}}}' ;;
    *) exit 0 ;;
  esac
done
`)
	t.Setenv("PI_WEB_5H_QUOTA", "1")
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{EnablePiExecution: true}, store, NewBroker())
	h := server.Handler()
	for _, tc := range []struct {
		method string
		path   string
		body   string
		code   int
	}{
		{http.MethodPost, "/api/workspaces/" + workspace.ID + "/sessions", "", http.StatusCreated},
		{http.MethodPost, "/api/workspaces/missing/sessions", "", http.StatusNotFound},
		{http.MethodDelete, "/api/workspaces/missing/sessions", "", http.StatusNotFound},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/commands", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/runtime-status", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/runtime-model", "", http.StatusOK},
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/runtime-quota?model=unknown", "", http.StatusOK},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != tc.code {
			t.Fatalf("%s %s expected %d got %d: %s", tc.method, tc.path, tc.code, res.Code, res.Body.String())
		}
	}

	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	settingsServer := NewServer(Config{}, store, NewBroker())
	settingsHandler := settingsServer.Handler()
	for _, tc := range []struct {
		method string
		path   string
		body   string
		code   int
	}{
		{http.MethodGet, "/api/workspaces/" + workspace.ID + "/settings", "", http.StatusOK},
		{http.MethodPut, "/api/workspaces/" + workspace.ID + "/settings", `{"scope":"global","settings":{"theme":"light"}}`, http.StatusOK},
		{http.MethodPut, "/api/workspaces/" + workspace.ID + "/settings", `{"scope":"bad","settings":{}}`, http.StatusBadRequest},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		res := httptest.NewRecorder()
		settingsHandler.ServeHTTP(res, req)
		if res.Code != tc.code {
			t.Fatalf("settings %s expected %d got %d: %s", tc.path, tc.code, res.Code, res.Body.String())
		}
	}

	_ = NewAutoStore()
	if _, err := ValidateWorkspacePath("bad\x00path"); err == nil {
		t.Fatal("expected nul path error")
	}
	if _, err := ValidateWorkspacePath("../relative"); err == nil {
		t.Fatal("expected relative path error")
	}
	if clean, err := ValidateWorkspacePath("~/does-not-exist"); err != nil || !strings.Contains(clean, "does-not-exist") {
		t.Fatalf("unexpected home path clean=%q err=%v", clean, err)
	}

	bare := filepath.Join(t.TempDir(), "source.git")
	if output, err := exec.Command("git", "init", "--bare", bare).CombinedOutput(); err != nil {
		t.Fatalf("git bare: %v %s", err, output)
	}
	cloneParent := t.TempDir()
	cloneStore := emptyStore("")
	cloned, _, err := CloneGitWorkspace(context.Background(), cloneStore, CloneWorkspaceRequest{ParentPath: cloneParent, GitURL: bare})
	if err != nil || cloned.ID == "" {
		t.Fatalf("clone success workspace=%+v err=%v", cloned, err)
	}
}

func TestCoverageRemainingEasyBranches(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "dir"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadWorkspaceFile(root, "dir", 0); err == nil {
		t.Fatal("expected read directory error")
	}
	if err := os.WriteFile(filepath.Join(root, "text.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	if file, err := ReadWorkspaceFile(root, "text.txt", 0); err != nil || file.Content != "hello" {
		t.Fatalf("default limit read=%+v err=%v", file, err)
	}
	if _, err := WriteWorkspaceFile(root, "../x", "x"); err == nil {
		t.Fatal("expected write traversal error")
	}
	if _, err := WriteWorkspaceFile(root, "missing", "x"); err == nil {
		t.Fatal("expected write missing error")
	}
	if _, err := WriteWorkspaceFile(root, "dir", "x"); err == nil {
		t.Fatal("expected write dir error")
	}
	readonly := filepath.Join(root, "readonly.txt")
	if err := os.WriteFile(readonly, []byte("x"), 0o400); err != nil {
		t.Fatal(err)
	}
	_, _ = WriteWorkspaceFile(root, "readonly.txt", "x")
	fakeGit := filepath.Join(t.TempDir(), "bin")
	if err := os.Mkdir(fakeGit, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fakeGit, "git"), []byte("#!/bin/sh\nif [ \"$3\" = branch ]; then exit 1; fi\nif [ \"$3\" = status ]; then exit 2; fi\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	oldPath := os.Getenv("PATH")
	t.Setenv("PATH", fakeGit+string(os.PathListSeparator)+oldPath)
	if _, err := RealGitStatus(root); err == nil {
		t.Fatal("expected branch error")
	}
	if err := os.WriteFile(filepath.Join(fakeGit, "git"), []byte("#!/bin/sh\nif [ \"$3\" = branch ]; then exit 0; fi\nif [ \"$3\" = status ]; then exit 2; fi\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := RealGitStatus(root); err == nil {
		t.Fatal("expected status error")
	}
	if err := os.WriteFile(filepath.Join(fakeGit, "git"), []byte("#!/bin/sh\nif [ \"$3\" = branch ]; then exit 0; fi\nif [ \"$3\" = status ]; then echo ' M x'; fi\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if status, err := RealGitStatus(root); err != nil || status.Branch != "HEAD" || status.Dirty != 1 {
		t.Fatalf("expected HEAD dirty status=%+v err=%v", status, err)
	}

	home := t.TempDir()
	t.Setenv("HOME", home)
	if expanded, err := ExpandUserPath("~"); err != nil || expanded != home {
		t.Fatalf("expand ~= %q err=%v", expanded, err)
	}
	if expanded, err := ExpandUserPath("~/child"); err != nil || expanded != filepath.Join(home, "child") {
		t.Fatalf("expand child= %q err=%v", expanded, err)
	}
	filePath := filepath.Join(root, "file")
	if err := os.WriteFile(filePath, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := ListFolders(filePath); err == nil {
		t.Fatal("expected file not dir")
	}
	if err := os.Mkdir(filepath.Join(root, ".hidden"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, ".config"), 0o700); err != nil {
		t.Fatal(err)
	}
	if listing, err := ListFolders(root); err != nil || listing.Path != root || len(listing.Folders) == 0 {
		t.Fatalf("listing=%+v err=%v", listing, err)
	}
	if _, err := ListFolders(filepath.Join(root, "missing")); err == nil {
		t.Fatal("expected missing list error")
	}

	for _, raw := range []string{
		`bad`,
		`{"type":"message","message":{"role":"unknown","content":"x"}}`,
		`{"type":"message","message":bad}`,
		`{"type":"message","message":{"role":"bashExecution","cancelled":true,"output":"cancel"}}`,
		`{"type":"message","message":{"role":"assistant","content":"plain"}}`,
		`{"type":"message","message":{"role":"assistant","content":null}}`,
		`{"type":"message","message":{"role":"user","content":[{"type":"image","data":"data:image/png;base64,abc"},{"type":"image","data":""},{"type":"text","text":"text"}]}}`,
	} {
		_ = ParsePiSessionLineMessages(raw)
	}
	if imageDataURL("data:image/png;base64,abc", "image/png") != "data:image/png;base64,abc" {
		t.Fatal("image data URL preserve failed")
	}
	if contentText(json.RawMessage(`{"x":1}`)) != `{"x":1}` {
		t.Fatal("raw contentText failed")
	}

	if got, ok := kimiUsedPercent(&kimiLimit{Details: &kimiLimit{UsedPercentage: 50}}); !ok || got != 50 {
		t.Fatalf("unexpected kimi details percent %v %v", got, ok)
	}
	if _, ok := kimiUsedPercent(nil); ok {
		t.Fatal("expected nil kimi percent false")
	}
	if _, ok := kimiUsedPercent(&kimiLimit{Limit: 0, Used: 1}); ok {
		t.Fatal("expected bad limit false")
	}
	if got := remainingFromUsedPercent(150, true); got == nil || *got != 0 {
		t.Fatalf("remaining clamp=%v", got)
	}
	if remainingFromUsedPercent(0, false) != nil {
		t.Fatal("expected nil remaining from false")
	}
	t.Setenv("PI_WEB_5H_QUOTA", "bad")
	if quotaFromEnv("PI_WEB_5H_QUOTA") != nil {
		t.Fatal("expected bad env nil")
	}

	oldHome := os.Getenv("HOME")
	t.Setenv("HOME", filepath.Join(t.TempDir(), "missing"))
	if five, weekly := fetchCodexQuota(context.Background()); five != nil || weekly != nil {
		t.Fatal("expected codex missing auth nil")
	}
	if five, weekly := fetchKimiCodeQuota(context.Background()); five != nil || weekly != nil {
		t.Fatal("expected kimi missing token nil")
	}
	t.Setenv("HOME", oldHome)
}

func TestCoverageRuntimeQuotaHTTPFilesAndSessions(t *testing.T) {
	root := t.TempDir()
	if output, err := exec.Command("git", "-C", root, "init", "-b", "main").CombinedOutput(); err != nil {
		t.Fatalf("git init: %v %s", err, output)
	}
	writeFakePi(t, root, `#!/bin/sh
while IFS= read -r line; do
  case "$line" in
    *get_state*) echo '{"id":"state","type":"response","command":"get_state","success":true,"data":{"model":{"id":"glm-test"}}}' ;;
    *) exit 0 ;;
  esac
done
`)
	status, err := WorkspaceRuntimeModelStatus(context.Background(), root)
	if err != nil || status.Model != "glm-test" || status.CurrentBranch == "" {
		t.Fatalf("model status=%+v err=%v", status, err)
	}
	t.Setenv("PI_WEB_5H_QUOTA", "42")
	status = WorkspaceRuntimeQuotaStatus(context.Background(), root, "unknown")
	if status.FiveHourQuota == nil || *status.FiveHourQuota != 42 {
		t.Fatalf("quota status=%+v", status)
	}
	status, err = WorkspaceRuntimeStatus(context.Background(), root)
	if err != nil || status.Model == "" || status.FiveHourQuota == nil {
		t.Fatalf("runtime status=%+v err=%v", status, err)
	}

	oldClient := http.DefaultClient
	t.Cleanup(func() { http.DefaultClient = oldClient })
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, ".pi", "agent"), 0o700); err != nil {
		t.Fatal(err)
	}
	if readAuthJSON(&struct{}{}) {
		t.Fatal("expected missing auth false")
	}
	if err := os.WriteFile(filepath.Join(home, ".pi", "agent", "auth.json"), []byte(`{"bad"`), 0o600); err != nil {
		t.Fatal(err)
	}
	if readAuthJSON(&struct{}{}) {
		t.Fatal("expected invalid auth false")
	}
	if err := os.WriteFile(filepath.Join(home, ".pi", "agent", "auth.json"), []byte(`{
		"openai-codex":{"access":"oa","accountId":"acct"},
		"kimi-coding":{"key":"kimi"},
		"zai":{"access":"zai"}
	}`), 0o600); err != nil {
		t.Fatal(err)
	}
	var seen []string
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		seen = append(seen, req.URL.Host+req.URL.Path+" "+req.Header.Get("Authorization"))
		body := `{}`
		switch req.URL.Host {
		case "chatgpt.com":
			body = `{"rate_limit":{"primary_window":{"used_percent":25},"secondary_window":{"used_percent":50}}}`
		case "api.kimi.com":
			body = `{"limits":[{"label":"5H","used_percent":20},{"label":"week","used_percent":30}]}`
		case "api.z.ai":
			return &http.Response{StatusCode: 500, Body: io.NopCloser(strings.NewReader(`bad`)), Header: make(http.Header)}, nil
		case "open.bigmodel.cn":
			body = `{"limits":[{"type":"TOKENS_LIMIT","percentage":10},{"usedPercentage":40}]}`
		default:
			return nil, errors.New("unexpected host")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	for _, model := range []string{"gpt", "kimi", "glm"} {
		five, weekly := LiveQuotaForModel(context.Background(), model)
		if five == nil || weekly == nil {
			t.Fatalf("expected live quota for %s, got %v %v", model, five, weekly)
		}
	}
	if len(seen) < 4 {
		t.Fatalf("expected http calls, got %+v", seen)
	}
	if getJSON(context.Background(), "//bad-url", nil, &struct{}{}) {
		t.Fatal("expected bad url false")
	}
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("transport")
	})}
	if getJSON(context.Background(), "https://example.com", nil, &struct{}{}) {
		t.Fatal("expected transport false")
	}
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`bad`)), Header: make(http.Header)}, nil
	})}
	if getJSON(context.Background(), "https://example.com", nil, &struct{}{}) {
		t.Fatal("expected decode false")
	}

	if SessionShortID("123456789") != "12345678" || SessionShortID("123") != "123" {
		t.Fatal("short id failed")
	}
	used := map[string]int{}
	if uniqueID("x", used) != "x" || uniqueID("x", used) != "x-2" {
		t.Fatalf("unique id failed: %+v", used)
	}
	if _, err := RealFileTree(filepath.Join(root, "missing"), 1); err == nil {
		t.Fatal("expected real file tree error")
	}
	if _, err := ReadWorkspaceFile(root, "missing", 1); err == nil {
		t.Fatal("expected read missing")
	}
	if _, err := ReadWorkspaceFile(root, ".", 1); err == nil {
		t.Fatal("expected read dir/path error")
	}
	if err := os.WriteFile(filepath.Join(root, "big.txt"), []byte("abcdef"), 0o600); err != nil {
		t.Fatal(err)
	}
	if file, err := ReadWorkspaceFile(root, "big.txt", 2); err != nil || !file.Truncated {
		t.Fatalf("expected truncated file=%+v err=%v", file, err)
	}
	if err := os.WriteFile(filepath.Join(root, "image.png"), []byte("\x89PNG\r\n\x1a\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if file, err := ReadWorkspaceFile(root, "image.png", 1024); err != nil || file.DataURL == "" {
		t.Fatalf("expected image data URL file=%+v err=%v", file, err)
	}

	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{EnablePiExecution: true}, store, NewBroker())
	server.runner.running[session.ID] = &activePiRun{cancel: func() {}, stdin: nopWriteCloser{io.Discard}}
	h := server.Handler()
	for _, tc := range []struct {
		method string
		path   string
		body   string
		code   int
	}{
		{http.MethodGet, "/api/sessions/" + session.ID, "", http.StatusOK},
		{http.MethodGet, "/api/sessions/missing", "", http.StatusNotFound},
		{http.MethodPatch, "/api/sessions/" + session.ID, `{bad`, http.StatusBadRequest},
		{http.MethodPatch, "/api/sessions/" + session.ID, `{"title":""}`, http.StatusInternalServerError},
		{http.MethodPatch, "/api/sessions/missing", `{"title":"x"}`, http.StatusNotFound},
		{http.MethodDelete, "/api/sessions/missing", "", http.StatusNotFound},
		{http.MethodPost, "/api/sessions/missing/prompt", `{}`, http.StatusNotFound},
		{http.MethodPost, "/api/sessions/" + session.ID + "/prompt", `{bad`, http.StatusBadRequest},
		{http.MethodPost, "/api/sessions/" + session.ID + "/prompt", `{"text":""}`, http.StatusBadRequest},
		{http.MethodPost, "/api/sessions/" + session.ID + "/prompt", `{"text":"go"}`, http.StatusConflict},
		{http.MethodPost, "/api/sessions/missing/steer", `{}`, http.StatusNotFound},
		{http.MethodPost, "/api/sessions/" + session.ID + "/steer", `{bad`, http.StatusBadRequest},
		{http.MethodPost, "/api/sessions/" + session.ID + "/steer", `{"text":""}`, http.StatusBadRequest},
		{http.MethodPost, "/api/sessions/" + session.ID + "/steer", `{"text":"go"}`, http.StatusAccepted},
		{http.MethodPost, "/api/sessions/" + session.ID + "/cancel", ``, http.StatusOK},
		{http.MethodPost, "/api/sessions/" + session.ID + "/cancel", ``, http.StatusOK},
		{http.MethodGet, "/api/sessions/missing/events", "", http.StatusNotFound},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != tc.code {
			t.Fatalf("%s %s expected %d got %d: %s", tc.method, tc.path, tc.code, res.Code, res.Body.String())
		}
	}

	if attachmentPromptText(PromptAttachment{Content: "body"}) != "body" {
		t.Fatal("attachmentPromptText unnamed failed")
	}
	if len(imagePromptAttachments([]PromptAttachment{{Type: "image", DataURL: " "}, {Type: "image", DataURL: "x"}, {Type: "file", DataURL: "x"}})) != 1 {
		t.Fatal("imagePromptAttachments failed")
	}
	if promptDisplayText("", nil) != "" || promptDisplayText("", []PromptAttachment{{Name: "a.txt"}}) != "[file: a.txt]" || promptDisplayText("", []PromptAttachment{{Type: "image"}}) != "[image]" {
		t.Fatal("promptDisplayText failed")
	}
	settings := map[string]any{"nested": map[string]any{"x": 1}, "slice": []any{map[string]any{"y": 2}}}
	clone := cloneSettingsMap(settings)
	if clone["nested"].(map[string]any)["x"].(int) != 1 {
		t.Fatal("cloneSettingsMap failed")
	}
}

func TestCoverageRPCCommandsModelRunnerAndTail(t *testing.T) {
	root := t.TempDir()
	bin := filepath.Join(root, "bin")
	if err := os.Mkdir(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	pi := filepath.Join(bin, "pi")
	script := `#!/bin/sh
while IFS= read -r line; do
  case "$line" in
    *get_commands*) echo '{"id":"commands","type":"response","command":"get_commands","success":true,"data":{"commands":[{"name":" review ","description":" desc ","source":"prompt","sourceInfo":{"path":"/p","scope":"user"}},{"name":"","description":"skip"}]}}' ;;
    *get_state*) echo '{"id":"state","type":"response","command":"get_state","success":true,"data":{"model":{"name":"GPT-Test","id":"id","provider":"provider"}}}' ;;
    *) echo '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hi"}}'; echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}'; echo '{"type":"agent_end"}'; exit 0 ;;
  esac
done
`
	if err := os.WriteFile(pi, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	commands, err := ListPiCommands(context.Background(), root)
	if err != nil || len(commands) != 1 || commands[0].Scope != "global" || commands[0].Command != "/review" {
		t.Fatalf("commands=%+v err=%v", commands, err)
	}
	model, err := CurrentPiModel(context.Background(), root)
	if err != nil || model != "GPT-Test" {
		t.Fatalf("model=%q err=%v", model, err)
	}
	for _, tc := range []struct {
		name   string
		script string
		want   string
	}{
		{name: "stderr", script: "#!/bin/sh\ncat >/dev/null\necho boom >&2\nsleep 0.1\n", want: "boom"},
		{name: "no-response", script: "#!/bin/sh\ncat >/dev/null\n", want: "no response"},
		{name: "scanner", script: "#!/bin/sh\ncat >/dev/null\npython3 - <<'PY'\nprint('x' * (9*1024*1024))\nPY\n", want: "token too long"},
	} {
		t.Run("commands "+tc.name, func(t *testing.T) {
			dir := t.TempDir()
			writeFakePi(t, dir, tc.script)
			_, err := ListPiCommands(context.Background(), root)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q error, got %v", tc.want, err)
			}
		})
	}
	for _, tc := range []struct {
		name   string
		script string
		want   string
	}{
		{name: "stderr", script: "#!/bin/sh\ncat >/dev/null\necho boom >&2\nsleep 0.1\n", want: "boom"},
		{name: "no-response", script: "#!/bin/sh\ncat >/dev/null\n", want: "no response"},
		{name: "scanner", script: "#!/bin/sh\ncat >/dev/null\npython3 - <<'PY'\nprint('x' * (3*1024*1024))\nPY\n", want: "token too long"},
	} {
		t.Run("model "+tc.name, func(t *testing.T) {
			dir := t.TempDir()
			writeFakePi(t, dir, tc.script)
			_, err := CurrentPiModel(context.Background(), root)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q error, got %v", tc.want, err)
			}
		})
	}

	if _, matched, err := parseCommandsRPCLine(`bad`); matched || err != nil {
		t.Fatal("expected invalid command line to be ignored")
	}
	if _, matched, err := parseCommandsRPCLine(`{"id":"other","type":"response","command":"get_commands"}`); matched || err != nil {
		t.Fatal("expected unmatched command line to be ignored")
	}
	if _, matched, err := parseCommandsRPCLine(`{"id":"commands","type":"response","command":"get_commands","success":false}`); !matched || err == nil {
		t.Fatal("expected commands error")
	}
	if _, matched, err := parseCommandsRPCLine(`{"id":"commands","type":"response","command":"get_commands","success":false,"error":"bad"}`); !matched || err == nil {
		t.Fatal("expected commands custom error")
	}
	if displayCommandScope(" Project ") != "project" || displayCommandScope("temporary") != "temporary" || displayCommandScope("path") != "path" || displayCommandScope("other") != "other" {
		t.Fatal("display scope failed")
	}
	for _, raw := range []string{
		`bad`,
		`{"id":"other","type":"response","command":"get_state"}`,
		`{"id":"state","type":"response","command":"get_state","success":false}`,
		`{"id":"state","type":"response","command":"get_state","success":false,"error":"bad"}`,
		`{"id":"state","type":"response","command":"get_state","success":true,"data":{}}`,
		`{"id":"state","type":"response","command":"get_state","success":true,"data":{"model":{"id":"id"}}}`,
		`{"id":"state","type":"response","command":"get_state","success":true,"data":{"model":{"provider":"provider"}}}`,
	} {
		_, _, _ = parseStateModelRPCLine(raw)
	}

	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	broker := NewBroker()
	runner := NewRunner()
	if err := runner.StartPiPrompt(context.Background(), broker, store, session.ID, "hello", []PromptAttachment{{DataURL: "data:image/png;base64,abc"}}, "hello"); err != nil {
		t.Fatalf("start prompt: %v", err)
	}
	deadline := time.After(2 * time.Second)
	for runner.IsRunning(session.ID) {
		select {
		case <-deadline:
			t.Fatal("runner did not finish")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}
	if err := runner.StartPiPrompt(context.Background(), broker, store, "missing", "x", nil, "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected missing start, got %v", err)
	}
	if err := runner.Steer(session.ID, "x", nil); err == nil {
		t.Fatal("expected steer not running")
	}
	if runner.Cancel("missing") {
		t.Fatal("expected cancel false")
	}

	var sent bytes.Buffer
	run := &activePiRun{cancel: func() {}, stdin: nopWriteCloser{&sent}}
	runner.running[session.ID] = run
	if err := runner.Steer(session.ID, "go", nil); err != nil {
		t.Fatalf("steer: %v", err)
	}
	if !runner.Cancel(session.ID) {
		t.Fatal("expected cancel true")
	}
	runner.running[session.ID] = run
	runner.forgetRun(session.ID, &activePiRun{})
	if !runner.IsRunning(session.ID) {
		t.Fatal("forgetRun removed wrong run")
	}
	runner.forgetRun(session.ID, run)
	if runner.IsRunning(session.ID) {
		t.Fatal("forgetRun did not remove run")
	}
	if err := (&activePiRun{stdin: errWriter{}}).send(map[string]any{"bad": make(chan int)}); err == nil {
		t.Fatal("expected marshal error")
	}
	if err := (&activePiRun{stdin: errWriter{}}).send(map[string]string{"ok": "x"}); err == nil {
		t.Fatal("expected write error")
	}
	if !isPiRPCAgentEnd(`{"type":"agent_end"}`) || isPiRPCAgentEnd(`bad`) || isPiRPCAgentEnd(`{"type":"other"}`) {
		t.Fatal("agent end detection failed")
	}
	cmd := rpcPromptCommand("text", []PromptAttachment{{DataURL: "data:image/jpeg;base64,abc", MIMEType: "image/jpeg"}, {DataURL: " "}}, "steer")
	if cmd.StreamingBehavior != "steer" || len(cmd.Images) != 1 || cmd.Images[0].Data != "abc" {
		t.Fatalf("unexpected rpc command: %+v", cmd)
	}
	for _, mime := range []string{"image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml", "text/plain"} {
		if imageExtension(mime) == "" {
			t.Fatalf("empty extension for %s", mime)
		}
	}

	broker = NewBroker()
	state := &jsonStreamState{}
	for _, raw := range []string{
		`bad`,
		`{"type":"session"}`,
		`{"type":"response","success":false,"error":"bad","command":"x"}`,
		`{"type":"message_update","assistantMessageEvent":{"type":"thinking_delta","delta":"why"}}`,
		`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","text":"hello"}}`,
		`{"type":"message_update","assistantMessageEvent":{"type":"text_start"}}`,
		`{"type":"message_end","message":{"role":"toolResult","toolName":"read","content":"ok"}}`,
		`{"type":"tool_execution_start","toolName":"bash","args":{"cmd":"ls"}}`,
		`{"type":"tool_execution_update","toolName":"bash","partialResult":"chunk"}`,
		`{"type":"tool_execution_end","toolName":"bash","isError":true,"args":{},"result":{"x":1}}`,
		`{"type":"turn_end"}`,
		`{"type":"unknown"}`,
	} {
		handlePiJSONEvent(raw, broker, store, session.ID, state)
	}
	if jsonChunk(nil) != "" || jsonChunk([]byte("null")) != "" || jsonChunk([]byte(`"x"`)) != "x" || jsonChunk([]byte(`{"x":1}`)) != `{"x":1}` {
		t.Fatal("jsonChunk failed")
	}
	if eventTypeForMessage(Message{Kind: "tool", Status: "running"}) != "tool.started" || eventTypeForMessage(Message{Kind: "tool"}) != "tool.finished" || eventTypeForMessage(Message{Kind: "pi"}) != "session.message" {
		t.Fatal("eventTypeForMessage failed")
	}

	path := filepath.Join(t.TempDir(), "session.jsonl")
	sessionLine := `{"type":"message","message":{"role":"user","content":"tail"}}`
	if got := readSessionLines(path, 5, func(string) {}); got != 5 {
		t.Fatalf("missing read offset=%d", got)
	}
	if err := os.WriteFile(path, []byte(sessionLine+"\npartial"), 0o600); err != nil {
		t.Fatal(err)
	}
	var lines int
	off := readSessionLines(path, 0, func(string) { lines++ })
	if lines != 1 || off <= 0 || fileSize(path) == 0 {
		t.Fatalf("lines=%d off=%d size=%d", lines, off, fileSize(path))
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	var emitted atomic.Int64
	go tailSessionFile(ctx, broker, store, session.ID, path, 0, &emitted, done)
	time.Sleep(150 * time.Millisecond)
	cancel()
	waitForTail(done)
	closed := make(chan struct{})
	close(closed)
	waitForTail(closed)
}

type nopWriteCloser struct{ io.Writer }

func (n nopWriteCloser) Close() error { return nil }

type errWriter struct{}

func (errWriter) Write([]byte) (int, error) { return 0, errors.New("write") }
func (errWriter) Close() error              { return nil }

func writeFakePi(t *testing.T, root string, script string) {
	t.Helper()
	bin := filepath.Join(root, "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func TestRunnerSelectCtxDoneAndStdoutDone(t *testing.T) {
	t.Run("stdoutDone", func(t *testing.T) {
		// Fake pi that reads stdin then exits without agent_end → stdoutDone fires
		dir := t.TempDir()
		bin := filepath.Join(dir, "bin")
		if err := os.MkdirAll(bin, 0o700); err != nil {
			t.Fatal(err)
		}
		// cat with timeout: read stdin briefly then exit without agent_end
		// stdoutDone fires because stdout closes without agent_end
		script := "#!/bin/sh\ntimeout 0.1 cat >/dev/null 2>&1; exit 0\n"
		if err := os.WriteFile(filepath.Join(bin, "pi"), []byte(script), 0o755); err != nil {
			t.Fatal(err)
		}
		t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

		t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
		store := NewMockStore()
		ws, err := store.OpenWorkspace(dir)
		if err != nil {
			t.Fatal(err)
		}
		session, err := store.CreateSession(ws.ID)
		if err != nil {
			t.Fatal(err)
		}

		broker := NewBroker()
		runner := NewRunner()
		if err := runner.StartPiPrompt(context.Background(), broker, store, session.ID, "hi", nil, "hi"); err != nil {
			t.Fatalf("start: %v", err)
		}
		deadline := time.After(3 * time.Second)
		for runner.IsRunning(session.ID) {
			select {
			case <-deadline:
				t.Fatal("runner did not finish")
			default:
				time.Sleep(10 * time.Millisecond)
			}
		}
	})

	t.Run("ctxDone", func(t *testing.T) {
		// Fake pi that blocks forever → we cancel the context → ctx.Done fires
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

		t.Setenv("PI_CODING_AGENT_SESSION_DIR", dir)
		store := NewMockStore()
		ws, err := store.OpenWorkspace(dir)
		if err != nil {
			t.Fatal(err)
		}
		session, err := store.CreateSession(ws.ID)
		if err != nil {
			t.Fatal(err)
		}

		broker := NewBroker()
		runner := NewRunner()
		ctx, cancel := context.WithCancel(context.Background())
		if err := runner.StartPiPrompt(ctx, broker, store, session.ID, "hi", nil, "hi"); err != nil {
			cancel()
			t.Fatalf("start: %v", err)
		}
		// Give the runner time to start and enter the select
		time.Sleep(200 * time.Millisecond)
		cancel()
		deadline := time.After(3 * time.Second)
		for runner.IsRunning(session.ID) {
			select {
			case <-deadline:
				t.Fatal("runner did not finish after cancel")
			default:
				time.Sleep(10 * time.Millisecond)
			}
		}
	})
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }
