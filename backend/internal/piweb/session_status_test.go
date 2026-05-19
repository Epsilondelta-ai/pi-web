package piweb

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
