package piweb

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWorkspaceEndpointMarksRunningSessionsLive(t *testing.T) {
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	server.runner.mu.Lock()
	server.runner.running["aa11-2233"] = &activePiRun{}
	server.runner.mu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Workspaces []Workspace `json:"workspaces"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for _, workspace := range body.Workspaces {
		if workspace.ID != "openclaw" {
			continue
		}
		if !workspace.Live || !workspace.Sessions[0].Live || !workspace.Sessions[0].Active {
			t.Fatalf("expected running session to mark workspace live: %+v", workspace)
		}
		return
	}
	t.Fatal("expected openclaw workspace")
}

func TestSessionEndpointReportsRunningStatus(t *testing.T) {
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	server.runner.mu.Lock()
	server.runner.running["8e7c-44ff"] = &activePiRun{}
	server.runner.mu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/8e7c-44ff", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"status":"running"`) {
		t.Fatalf("expected running status: %s", res.Body.String())
	}
}
