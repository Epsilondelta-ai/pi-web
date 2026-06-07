package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWorkspaceSessionsEndpointMarksRunningSessionsLive(t *testing.T) {
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	runner := server.runner.(*Runner)
	runner.MarkRunningForTest("aa11-2233")

	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/openclaw/sessions", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Sessions []Session `json:"sessions"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Sessions) == 0 || !body.Sessions[0].Live || !body.Sessions[0].Active {
		t.Fatalf("expected running session to be live: %+v", body.Sessions)
	}
}

func TestSessionEndpointReportsRunningStatus(t *testing.T) {
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	runner := server.runner.(*Runner)
	runner.MarkRunningForTest("8e7c-44ff")

	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/pi-mono/sessions/8e7c-44ff", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"status":"running"`) {
		t.Fatalf("expected running status: %s", res.Body.String())
	}
}
