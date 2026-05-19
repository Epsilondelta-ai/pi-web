package piweb

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParsePiSessionLineSkipsAssistantToolCallPlaceholders(t *testing.T) {
	messages := ParsePiSessionLineMessages(`{"type":"message","id":"b","parentId":"a","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"toolCall","name":"read","arguments":{"path":"README.md"}}]}}`)
	if len(messages) != 0 {
		t.Fatalf("unexpected placeholder messages: %#v", messages)
	}
}

func TestParsePiSessionLineMessagesKeepsThinkingAndAnswer(t *testing.T) {
	messages := ParsePiSessionLineMessages(`{"type":"message","id":"b","parentId":"a","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"checking"},{"type":"text","text":"done"}]}}`)
	if len(messages) != 2 || messages[0].Kind != "think" || messages[1].Kind != "pi" || messages[1].Text != "done" {
		t.Fatalf("unexpected messages: %#v", messages)
	}
}

func TestParsePiSessionFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "session.jsonl")
	data := `{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/tmp/project"}
{"type":"message","id":"a","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":"hello world"}}
{"type":"message","id":"b","parentId":"a","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"hi"}],"provider":"x","model":"m","stopReason":"stop"}}
`
	if err := os.WriteFile(file, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	parsed, err := ParsePiSessionFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Session.ID != "s1" || parsed.Session.Title != "hello world" || len(parsed.Messages) != 2 {
		t.Fatalf("unexpected parsed session: %#v", parsed)
	}
}

func TestLoadPiSessionsOrdersByCreationTimeNotModTime(t *testing.T) {
	dir := t.TempDir()
	olderFile := writeTestSessionFile(t, dir, "a-old", "2026-01-01T00:00:00.000Z", "/tmp/project")
	newerFile := writeTestSessionFile(t, dir, "z-new", "2026-01-02T00:00:00.000Z", "/tmp/project")
	laterModTime := time.Now().Add(time.Hour)
	if err := os.Chtimes(olderFile, laterModTime, laterModTime); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(newerFile, time.Now(), time.Now()); err != nil {
		t.Fatal(err)
	}

	sessions, err := LoadPiSessions(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 2 || sessions[0].Session.ID != "z-new" || sessions[1].Session.ID != "a-old" {
		t.Fatalf("unexpected order: %#v", sessions)
	}
}

func TestNewPiStoreKeepsSessionCreationOrder(t *testing.T) {
	root := t.TempDir()
	sessionDir := filepath.Join(root, "--tmp-project--")
	if err := os.MkdirAll(sessionDir, 0o700); err != nil {
		t.Fatal(err)
	}
	olderFile := writeTestSessionFile(t, sessionDir, "a-old", "2026-01-01T00:00:00.000Z", "/tmp/project")
	newerFile := writeTestSessionFile(t, sessionDir, "z-new", "2026-01-02T00:00:00.000Z", "/tmp/project")
	laterModTime := time.Now().Add(time.Hour)
	if err := os.Chtimes(olderFile, laterModTime, laterModTime); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(newerFile, time.Now(), time.Now()); err != nil {
		t.Fatal(err)
	}

	store, err := NewPiStore(root)
	if err != nil {
		t.Fatal(err)
	}
	workspaces := store.Workspaces()
	if len(workspaces) != 1 || len(workspaces[0].Sessions) != 2 {
		t.Fatalf("unexpected workspaces: %#v", workspaces)
	}
	if workspaces[0].Sessions[0].ID != "z-new" || workspaces[0].Sessions[1].ID != "a-old" {
		t.Fatalf("unexpected session order: %#v", workspaces[0].Sessions)
	}
}

func TestNewPiStore(t *testing.T) {
	root := t.TempDir()
	sessionDir := filepath.Join(root, "--tmp-project--")
	if err := os.MkdirAll(sessionDir, 0o700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(sessionDir, "session.jsonl")
	data := `{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/tmp/project"}
{"type":"message","id":"a","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":"hello"}}
`
	if err := os.WriteFile(file, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := NewPiStore(root)
	if err != nil {
		t.Fatal(err)
	}
	workspaces := store.Workspaces()
	if len(workspaces) != 1 || workspaces[0].ID != "project" || len(workspaces[0].Sessions) != 1 {
		t.Fatalf("unexpected workspaces: %#v", workspaces)
	}
}

func writeTestSessionFile(t *testing.T, dir, id, timestamp, cwd string) string {
	t.Helper()
	file := filepath.Join(dir, id+".jsonl")
	data := fmt.Sprintf(
		"{\"type\":\"session\",\"version\":3,\"id\":%q,\"timestamp\":%q,\"cwd\":%q}\n",
		id,
		timestamp,
		cwd,
	)
	if err := os.WriteFile(file, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}
