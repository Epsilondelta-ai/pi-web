package server

import (
	"bytes"
	"context"
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

func TestPiVersionEndpoint(t *testing.T) {
	server := NewServer(Config{
		EnablePiExecution: true,
		PiVersionStatus: func(_ context.Context) (PiVersionStatus, error) {
			return PiVersionStatus{CurrentVersion: "0.75.0", LatestVersion: "0.75.5", UpdateAvailable: true, Note: "security"}, nil
		},
	}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/pi/version", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
	if !strings.Contains(res.Body.String(), `"currentVersion":"0.75.0"`) ||
		!strings.Contains(res.Body.String(), `"latestVersion":"0.75.5"`) ||
		!strings.Contains(res.Body.String(), `"updateAvailable":true`) ||
		!strings.Contains(res.Body.String(), `"note":"security"`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestPiUpdateEndpoints(t *testing.T) {
	done := make(chan string, 1)
	server := NewServer(Config{
		EnablePiExecution: true,
		PiPackageUpdateStatus: func(context.Context) (PiPackageUpdateStatus, error) {
			return PiPackageUpdateStatus{Updates: []PiPackageUpdate{{Source: "npm:@example/pkg", DisplayName: "@example/pkg"}}}, nil
		},
		PiUpdateRunner: func(_ context.Context, source string, _ string) error {
			done <- source
			return nil
		},
	}, NewMockStore(), NewBroker())

	forbiddenReq := httptest.NewRequest(http.MethodPost, "/api/pi/update", nil)
	forbiddenRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(forbiddenRes, forbiddenReq)
	if forbiddenRes.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden update without app header, got %d", forbiddenRes.Code)
	}

	packageReq := httptest.NewRequest(http.MethodGet, "/api/pi/package-updates", nil)
	packageRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(packageRes, packageReq)
	if packageRes.Code != http.StatusOK || !strings.Contains(packageRes.Body.String(), `"source":"npm:@example/pkg"`) {
		t.Fatalf("unexpected package updates response: %d %s", packageRes.Code, packageRes.Body.String())
	}

	startReq := httptest.NewRequest(http.MethodPost, "/api/pi/update", strings.NewReader(`{"source":"npm:@example/pkg"}`))
	startReq.Header.Set("X-Pi-Web-Request", "pi-update")
	startRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(startRes, startReq)
	if startRes.Code != http.StatusAccepted || !strings.Contains(startRes.Body.String(), `"state":"updating"`) {
		t.Fatalf("unexpected start response: %d %s", startRes.Code, startRes.Body.String())
	}
	select {
	case source := <-done:
		if source != "npm:@example/pkg" {
			t.Fatalf("unexpected update source: %q", source)
		}
	case <-time.After(time.Second):
		t.Fatal("update runner did not run")
	}

	statusReq := httptest.NewRequest(http.MethodGet, "/api/pi/update", nil)
	statusRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(statusRes, statusReq)
	if statusRes.Code != http.StatusOK || !strings.Contains(statusRes.Body.String(), `"state":"updated"`) {
		t.Fatalf("unexpected status response: %d %s", statusRes.Code, statusRes.Body.String())
	}

	badWorkspaceReq := httptest.NewRequest(http.MethodPost, "/api/pi/update", strings.NewReader(`{"workspaceId":"missing"}`))
	badWorkspaceReq.Header.Set("X-Pi-Web-Request", "pi-update")
	badWorkspaceRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(badWorkspaceRes, badWorkspaceReq)
	if badWorkspaceRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing workspace to reject update, got %d %s", badWorkspaceRes.Code, badWorkspaceRes.Body.String())
	}
}

func TestPiUpdateEndpointRunsWorkspaceUpdateInWorkspaceDir(t *testing.T) {
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan string, 1)
	server := NewServer(Config{
		EnablePiExecution: true,
		PiUpdateRunner: func(_ context.Context, _ string, workspaceDir string) error {
			done <- workspaceDir
			return nil
		},
	}, store, NewBroker())

	startReq := httptest.NewRequest(http.MethodPost, "/api/pi/update", strings.NewReader(`{"workspaceId":"`+workspace.ID+`"}`))
	startReq.Header.Set("X-Pi-Web-Request", "pi-update")
	startRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(startRes, startReq)
	if startRes.Code != http.StatusAccepted {
		t.Fatalf("unexpected start response: %d %s", startRes.Code, startRes.Body.String())
	}
	select {
	case workspaceDir := <-done:
		if workspaceDir != workspace.Path {
			t.Fatalf("expected workspace update in %q, got %q", workspace.Path, workspaceDir)
		}
	case <-time.After(time.Second):
		t.Fatal("update runner did not run")
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

	req = httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	res = httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK || res.Header().Get("Content-Encoding") != "gzip" || res.Header().Get("Vary") != "Accept-Encoding" {
		t.Fatalf("expected gzip static asset, got %d encoding=%q vary=%q", res.Code, res.Header().Get("Content-Encoding"), res.Header().Get("Vary"))
	}
	if contentType := res.Header().Get("Content-Type"); contentType != "text/javascript; charset=utf-8" {
		t.Fatalf("expected gzip js content type, got %q", contentType)
	}

	files["assets/app.css"] = &fstest.MapFile{Data: []byte("body{}")}
	req = httptest.NewRequest(http.MethodGet, "/assets/app.css", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	res = httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if contentType := res.Header().Get("Content-Type"); contentType != "text/css; charset=utf-8" {
		t.Fatalf("expected gzip css content type, got %q", contentType)
	}
}

func TestWorkspaceCommandsEndpointListsNativeCommands(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".pi", "prompts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".pi", "prompts", "review.md"), []byte("---\ndescription: Review current changes\n---\nbody"), 0o644); err != nil {
		t.Fatal(err)
	}
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{EnablePiExecution: false}, store, NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/commands", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"command":"/review"`) || !strings.Contains(res.Body.String(), `"command":"/reload"`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestWorkspaceCommandsEndpointDoesNotShellOutToPi(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", t.TempDir())
	writeFakePi(t, root, "#!/bin/sh\necho should-not-run >&2\nexit 1\n")
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{EnablePiExecution: true}, store, NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/commands", nil)
	res := httptest.NewRecorder()

	server.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"command":"/reload"`) || strings.Contains(res.Body.String(), "should-not-run") {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestWorkspaceModelsEndpointUsesMockModelsWhenPiDisabled(t *testing.T) {
	server := NewServer(Config{EnablePiExecution: false}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/pi-mono/models", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"id":"zai"`) || !strings.Contains(res.Body.String(), `"id":"gpt-5.5"`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}

func TestWorkspaceModelsEndpointUsesNoExtensions(t *testing.T) {
	root := t.TempDir()
	argsFile := filepath.Join(root, "args.txt")
	t.Setenv("PI_ARGS_FILE", argsFile)
	writeFakePi(t, root, `#!/bin/sh
echo "$@" > "$PI_ARGS_FILE"
echo 'provider  model  context  max-out  thinking  images' >&2
echo 'zai gpt-5.5 1M 64K yes no' >&2
`)
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{EnablePiExecution: true}, store, NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/models", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"id":"gpt-5.5"`) {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
	args, err := os.ReadFile(argsFile)
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(args)) != "--no-extensions --list-models" {
		t.Fatalf("unexpected pi args: %q", string(args))
	}
}

func TestWorkspaceModelsEndpointFallsBackOnPiFailure(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".pi", "settings.json"), []byte(`{"defaultProvider":"anthropic","defaultModel":"claude-test"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	writeFakePi(t, root, `#!/bin/sh
echo 'signal: killed' >&2
exit 137
`)
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(root)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{EnablePiExecution: true}, store, NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspace.ID+"/models", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200 fallback, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if !strings.Contains(body, `"id":"anthropic"`) || !strings.Contains(body, `"id":"claude-test"`) || !strings.Contains(body, `"error"`) {
		t.Fatalf("unexpected fallback body: %s", body)
	}
}

func TestParseListModelsOutput(t *testing.T) {
	models := parseListModelsOutput("provider  model  context  max-out  thinking  images\nzai gpt-5.5 1M 64K yes no\nanthropic claude 200K 8K yes yes\n")
	if len(models.Providers) != 2 || models.Providers[0].ID != "anthropic" || models.Providers[1].Models[0].ID != "gpt-5.5" {
		t.Fatalf("unexpected models: %+v", models)
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
	if err := os.MkdirAll(filepath.Join(home, ".pi", "web"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	globalPath := filepath.Join(home, ".pi", "agent", "settings.json")
	projectPath := filepath.Join(root, ".pi", "settings.json")
	webProjectPath := filepath.Join(root, ".pi", "pi-web.json")
	if err := os.MkdirAll(filepath.Dir(globalPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(globalPath, []byte(`{"theme":"dark","compaction":{"enabled":true}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(projectPath, []byte(`{"defaultModel":"gpt-5.5"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(webProjectPath, []byte(`{"defaultModel":"legacy-wrong","readResponsesAloud":true}`), 0o600); err != nil {
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
		strings.Contains(getRes.Body.String(), "legacy-wrong") ||
		!strings.Contains(getRes.Body.String(), `"transport":"auto"`) ||
		!strings.Contains(getRes.Body.String(), `"imageWidthCells":60`) {
		t.Fatalf("unexpected settings body: %s", getRes.Body.String())
	}

	body := `{"scope":"project","settings":{"defaultModel":null,"transport":"sse","warnings":{"anthropicExtraUsage":null},"compaction":{"enabled":false},"readResponsesAloud":false}}`
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
		t.Fatalf("unexpected saved pi settings: %s", string(saved))
	}
	webSaved, err := os.ReadFile(webProjectPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(webSaved), `"readResponsesAloud": false`) || strings.Contains(string(webSaved), "transport") {
		t.Fatalf("unexpected saved pi-web settings: %s", string(webSaved))
	}
	if !strings.Contains(putRes.Body.String(), `"enabled":false`) {
		t.Fatalf("effective settings did not include project compaction override: %s", putRes.Body.String())
	}
}

func TestAuthEndpointsSaveListAndLogoutAPIKeys(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	authPath := filepath.Join(home, ".pi", "agent", "auth.json")
	if err := os.MkdirAll(filepath.Dir(authPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(authPath, []byte(`{"openai":{"type":"oauth","access":"keep"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{}, NewMockStore(), NewBroker())

	postBody := `{"provider":"anthropic","apiKey":"sk-test-secret"}`
	postReq := httptest.NewRequest(http.MethodPost, "/api/auth/api-key", bytes.NewBufferString(postBody))
	postRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(postRes, postReq)
	if postRes.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", postRes.Code, postRes.Body.String())
	}
	if strings.Contains(postRes.Body.String(), "sk-test-secret") || !strings.Contains(postRes.Body.String(), `"configured":true`) {
		t.Fatalf("unexpected API key response: %s", postRes.Body.String())
	}
	saved, err := os.ReadFile(authPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(saved), "sk-test-secret") || !strings.Contains(string(saved), `"type": "api_key"`) ||
		!strings.Contains(string(saved), `"access": "keep"`) {
		t.Fatalf("unexpected auth file: %s", string(saved))
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/auth/providers", nil)
	getRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(getRes, getReq)
	if getRes.Code != http.StatusOK || !strings.Contains(getRes.Body.String(), `"id":"anthropic"`) ||
		!strings.Contains(getRes.Body.String(), `"source":"api_key"`) {
		t.Fatalf("unexpected providers response: %d %s", getRes.Code, getRes.Body.String())
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/auth/anthropic", nil)
	deleteRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(deleteRes, deleteReq)
	if deleteRes.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
	saved, err = os.ReadFile(authPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(saved), "anthropic") || strings.Contains(string(saved), "sk-test-secret") {
		t.Fatalf("logout did not remove credential: %s", string(saved))
	}
}
