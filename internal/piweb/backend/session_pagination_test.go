package backend

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestSessionEndpointReturnsMessagePage(t *testing.T) {
	store, sessionID := pagedSessionStore(t, 5)
	server := NewServer(Config{}, store, NewBroker())

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/"+sessionID+"?limit=2", nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Messages []Message `json:"messages"`
		Cursor   string    `json:"cursor"`
		HasMore  bool      `json:"hasMore"`
		Limit    int       `json:"limit"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Limit != 2 || !body.HasMore || body.Cursor == "" {
		t.Fatalf("unexpected page metadata: %+v", body)
	}
	if got := messageTexts(body.Messages); strings.Join(got, ",") != "message 3,message 4" {
		t.Fatalf("unexpected tail messages: %#v", got)
	}
}

func TestSessionEndpointReturnsOlderMessagePage(t *testing.T) {
	store, sessionID := pagedSessionStore(t, 5)
	server := NewServer(Config{}, store, NewBroker())

	first := requestSessionPage(t, server, sessionID, "?limit=2")
	older := requestSessionPage(t, server, sessionID, "?limit=2&before="+first.Cursor)

	if got := messageTexts(older.Messages); strings.Join(got, ",") != "message 1,message 2" {
		t.Fatalf("unexpected older messages: %#v", got)
	}
	if !older.HasMore {
		t.Fatalf("expected more pages: %+v", older)
	}
}

func TestWorkspaceListingDoesNotRetainFullConversationBodies(t *testing.T) {
	store, _ := pagedSessionStore(t, 3)
	workspaces := store.Workspaces()
	if len(workspaces) != 1 || len(workspaces[0].Sessions) != 1 {
		t.Fatalf("unexpected workspaces: %#v", workspaces)
	}
	if count := store.ConversationLen(workspaces[0].Sessions[0].ID); count != 0 {
		t.Fatalf("expected metadata listing to avoid conversation bodies, got %d", count)
	}
}

func requestSessionPage(t *testing.T, server *Server, sessionID string, query string) struct {
	Messages []Message `json:"messages"`
	Cursor   string    `json:"cursor"`
	HasMore  bool      `json:"hasMore"`
} {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/sessions/"+sessionID+query, nil)
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Messages []Message `json:"messages"`
		Cursor   string    `json:"cursor"`
		HasMore  bool      `json:"hasMore"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func pagedSessionStore(t *testing.T, count int) (*Store, string) {
	t.Helper()
	sessionRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", sessionRoot)
	_, file, err := CreatePiSessionFile(workspaceRoot)
	if err != nil {
		t.Fatal(err)
	}
	for index := 0; index < count; index++ {
		appendSessionTestLine(t, file, map[string]any{
			"type":      "message",
			"id":        strconv.Itoa(index),
			"timestamp": "2026-01-01T00:00:00Z",
			"message": map[string]any{
				"role":    "assistant",
				"content": []map[string]string{{"type": "text", "text": "message " + strconv.Itoa(index)}},
			},
		})
	}
	store := NewWebStore(filepath.Join(t.TempDir(), "web.db"))
	workspace, err := store.OpenWorkspace(workspaceRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(workspace.Sessions) != 1 {
		t.Fatalf("expected one session: %#v", workspace)
	}
	return store, workspace.Sessions[0].ID
}

func appendSessionTestLine(t *testing.T, file string, value map[string]any) {
	t.Helper()
	line, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	handle, err := os.OpenFile(file, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer handle.Close()
	if _, err := handle.Write(append(line, '\n')); err != nil {
		t.Fatal(err)
	}
}

func messageTexts(messages []Message) []string {
	texts := make([]string, 0, len(messages))
	for _, message := range messages {
		texts = append(texts, message.Text)
	}
	return texts
}
