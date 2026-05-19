package piweb

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestHealthEndpoint(t *testing.T) {
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
	if !strings.Contains(res.Body.String(), `"ok":true`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestVersionEndpoint(t *testing.T) {
	server := NewServer(Config{
		CurrentVersion: "1.0.0",
		VersionStatus: func(_ context.Context, current string) (VersionStatus, error) {
			return VersionStatus{CurrentVersion: current, LatestVersion: "1.1.0", UpdateAvailable: true}, nil
		},
	}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
	if !strings.Contains(res.Body.String(), `"currentVersion":"1.0.0"`) ||
		!strings.Contains(res.Body.String(), `"latestVersion":"1.1.0"`) ||
		!strings.Contains(res.Body.String(), `"updateAvailable":true`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestServesStaticUI(t *testing.T) {
	files := fstest.MapFS{
		"index.html":    {Data: []byte("<html>app shell</html>")},
		"assets/app.js": {Data: []byte("console.log('app')")},
	}
	server := NewServer(Config{StaticFiles: files}, NewMockStore(), NewBroker())

	for _, tc := range []struct {
		path string
		want string
	}{
		{path: "/", want: "app shell"},
		{path: "/assets/app.js", want: "console.log('app')"},
		{path: "/workspaces/demo", want: "app shell"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			res := httptest.NewRecorder()
			server.Handler().ServeHTTP(res, req)
			if res.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d", res.Code)
			}
			if !strings.Contains(res.Body.String(), tc.want) {
				t.Fatalf("unexpected body: %s", res.Body.String())
			}
		})
	}

	req := httptest.NewRequest(http.MethodGet, "/api/not-found", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("expected unknown API route to stay 404, got %d", res.Code)
	}
}

func TestWorkspaceAndSessionManagementEndpoints(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{}, store, NewBroker())

	createReq := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+workspace.ID+"/sessions", nil)
	createRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(createRes, createReq)
	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", createRes.Code, createRes.Body.String())
	}

	var body struct {
		Session Session `json:"session"`
	}
	if err := json.NewDecoder(createRes.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	renameReq := httptest.NewRequest(http.MethodPatch, "/api/sessions/"+body.Session.ID, bytes.NewBufferString(`{"title":"renamed"}`))
	renameRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(renameRes, renameReq)
	if renameRes.Code != http.StatusOK || !strings.Contains(renameRes.Body.String(), "renamed") {
		t.Fatalf("rename failed: %d %s", renameRes.Code, renameRes.Body.String())
	}
	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/sessions/"+body.Session.ID, nil)
	deleteRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(deleteRes, deleteReq)
	if deleteRes.Code != http.StatusOK {
		t.Fatalf("delete failed: %d %s", deleteRes.Code, deleteRes.Body.String())
	}
}

func TestWorkspaceCommandsEndpointUsesMockCommandsWhenPiDisabled(t *testing.T) {
	server := NewServer(Config{EnablePiExecution: false}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/pi-mono/commands", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"command":"/review"`) || !strings.Contains(res.Body.String(), `"scope":"project"`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestWorkspaceRuntimeStatusEndpointUsesMockStatusWhenPiDisabled(t *testing.T) {
	server := NewServer(Config{EnablePiExecution: false}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/pi-mono/runtime-status", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"model":"GPT-5.5"`) || !strings.Contains(res.Body.String(), `"weeklyQuota":14`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestWorkspaceSettingsEndpointReadsAndSavesSettings(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, ".pi", "agent"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	globalPath := filepath.Join(home, ".pi", "agent", "settings.json")
	projectPath := filepath.Join(root, ".pi", "settings.json")
	if err := os.WriteFile(globalPath, []byte(`{"theme":"dark","compaction":{"enabled":true}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(projectPath, []byte(`{"defaultModel":"gpt-5.5"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{}, store, NewBroker())

	getReq := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/settings", nil)
	getRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(getRes, getReq)
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", getRes.Code, getRes.Body.String())
	}
	if !strings.Contains(getRes.Body.String(), `"theme":"dark"`) ||
		!strings.Contains(getRes.Body.String(), `"defaultModel":"gpt-5.5"`) ||
		!strings.Contains(getRes.Body.String(), `"transport":"auto"`) ||
		!strings.Contains(getRes.Body.String(), `"imageWidthCells":60`) {
		t.Fatalf("unexpected settings body: %s", getRes.Body.String())
	}

	body := `{"scope":"project","settings":{"defaultModel":null,"transport":"sse","warnings":{"anthropicExtraUsage":null},"compaction":{"enabled":false}}}`
	putReq := httptest.NewRequest(http.MethodPut, "/api/workspaces/"+workspace.ID+"/settings", bytes.NewBufferString(body))
	putRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(putRes, putReq)
	if putRes.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", putRes.Code, putRes.Body.String())
	}
	saved, err := os.ReadFile(projectPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(saved), "defaultModel") || strings.Contains(string(saved), "warnings") ||
		!strings.Contains(string(saved), `"transport": "sse"`) {
		t.Fatalf("unexpected saved settings: %s", string(saved))
	}
	if !strings.Contains(putRes.Body.String(), `"enabled":false`) {
		t.Fatalf("effective settings did not include project compaction override: %s", putRes.Body.String())
	}
}

func TestWorkspaceRuntimeSplitEndpointsUseMockStatusWhenPiDisabled(t *testing.T) {
	server := NewServer(Config{EnablePiExecution: false}, NewMockStore(), NewBroker())
	modelReq := httptest.NewRequest(http.MethodGet, "/api/workspaces/pi-mono/runtime-model", nil)
	modelRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(modelRes, modelReq)
	if modelRes.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", modelRes.Code, modelRes.Body.String())
	}
	if !strings.Contains(modelRes.Body.String(), `"model":"GPT-5.5"`) || strings.Contains(modelRes.Body.String(), "weeklyQuota") {
		t.Fatalf("unexpected model body: %s", modelRes.Body.String())
	}

	quotaReq := httptest.NewRequest(http.MethodGet, "/api/workspaces/pi-mono/runtime-quota?model=GPT-5.5", nil)
	quotaRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(quotaRes, quotaReq)
	if quotaRes.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", quotaRes.Code, quotaRes.Body.String())
	}
	if !strings.Contains(quotaRes.Body.String(), `"weeklyQuota":14`) || strings.Contains(quotaRes.Body.String(), "currentBranch") {
		t.Fatalf("unexpected quota body: %s", quotaRes.Body.String())
	}
}

func TestCreateSessionEndpoint(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{}, store, NewBroker())
	req := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+workspace.ID+"/sessions", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"title":"new session"`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestSteerPublishesQueuedUserMessage(t *testing.T) {
	broker := NewBroker()
	broker.heartbeat = time.Hour
	server := NewServer(Config{}, NewMockStore(), broker)
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	res, err := testServer.Client().Post(
		testServer.URL+"/api/sessions/8e7c-44ff/steer",
		"application/json",
		bytes.NewBufferString(`{"text":"one more thing"}`),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusAccepted {
		t.Fatalf("expected steer 202, got %d", res.StatusCode)
	}
}

func TestPromptPublishesSSE(t *testing.T) {
	broker := NewBroker()
	broker.heartbeat = time.Hour
	server := NewServer(Config{}, NewMockStore(), broker)
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	eventsReq, err := http.NewRequest(http.MethodGet, testServer.URL+"/api/sessions/8e7c-44ff/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	eventsRes, err := testServer.Client().Do(eventsReq)
	if err != nil {
		t.Fatal(err)
	}
	defer eventsRes.Body.Close()
	if eventsRes.StatusCode != http.StatusOK {
		t.Fatalf("expected event stream 200, got %d", eventsRes.StatusCode)
	}

	promptRes, err := testServer.Client().Post(testServer.URL+"/api/sessions/8e7c-44ff/prompt", "application/json", bytes.NewBufferString(`{"text":"hello"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer promptRes.Body.Close()
	if promptRes.StatusCode != http.StatusAccepted {
		t.Fatalf("expected prompt 202, got %d", promptRes.StatusCode)
	}

	lines := make(chan string, 16)
	go func() {
		scanner := bufio.NewScanner(eventsRes.Body)
		for scanner.Scan() {
			lines <- scanner.Text()
		}
	}()

	deadline := time.After(2 * time.Second)
	for {
		select {
		case line := <-lines:
			if line == "event: session.message" {
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for session.message event")
		}
	}
}
