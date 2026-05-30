package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateWorkspacePath(t *testing.T) {
	if _, err := ValidateWorkspacePath(""); err == nil {
		t.Fatal("expected empty path to fail")
	}
	if _, err := ValidateWorkspacePath("/tmp/project"); err != nil {
		t.Fatalf("expected valid path: %v", err)
	}
}

func TestWebStoreLoadsOnlyWebRecents(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	wanted := t.TempDir()
	unwanted := t.TempDir()
	if _, _, err := CreatePiSessionFile(wanted); err != nil {
		t.Fatal(err)
	}
	if _, _, err := CreatePiSessionFile(unwanted); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(t.TempDir(), "pi-web.db")
	if err := SaveWebWorkspacePaths(dbPath, []string{wanted}); err != nil {
		t.Fatal(err)
	}
	store := NewWebStore(dbPath)
	workspaces := store.Workspaces()
	if len(workspaces) != 1 || workspaces[0].Path != wanted || len(workspaces[0].Sessions) != 1 {
		t.Fatalf("unexpected workspaces: %#v", workspaces)
	}
}

func TestCreateSession(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	home := t.TempDir()
	t.Setenv("HOME", home)
	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(home, ".pi", "agent"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".pi", "agent", "AGENTS.md"), []byte("global"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "AGENTS.md"), []byte("project"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(workspaceRoot)
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	file, cwd, ok := store.SessionRuntime(session.ID)
	if !ok || cwd != workspaceRoot {
		t.Fatalf("missing runtime: %q %q %v", file, cwd, ok)
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatal(err)
	}
	_, messages, err := store.Session(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].Kind != "banner" {
		t.Fatalf("expected context banner, got %#v", messages)
	}
	if !strings.Contains(messages[0].Text, "loaded AGENTS.md files · 2") || !strings.Contains(messages[0].Text, filepath.Join(workspaceRoot, "AGENTS.md")) {
		t.Fatalf("unexpected context banner: %q", messages[0].Text)
	}
}

func TestStoreRefreshesWorkspaceSessionsFromDisk(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	workspaceRoot := t.TempDir()
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(workspaceRoot)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := CreatePiSessionFile(workspaceRoot); err != nil {
		t.Fatal(err)
	}

	sessions, err := store.Sessions(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected disk session to appear without restart, got %#v", sessions)
	}
}

func TestStoreRefreshPreservesInMemoryMessages(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	workspaceRoot := t.TempDir()
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(workspaceRoot)
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AppendMessage(session.ID, Message{Kind: "user", Text: "still here"}); err != nil {
		t.Fatal(err)
	}

	_, messages, err := store.Session(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 2 || messages[1].Text != "still here" {
		t.Fatalf("expected in-memory message to survive refresh, got %#v", messages)
	}
}

func TestDeleteWorkspaceSessionsRemovesCachedAndDiskSessions(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	workspaceRoot := t.TempDir()
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(workspaceRoot)
	if err != nil {
		t.Fatal(err)
	}
	cached, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := CreatePiSessionFile(workspaceRoot); err != nil {
		t.Fatal(err)
	}

	deleted, err := store.DeleteWorkspaceSessions(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 2 {
		t.Fatalf("expected 2 deleted sessions, got %d", deleted)
	}
	if _, _, ok := store.SessionRuntime(cached.ID); ok {
		t.Fatalf("expected runtime metadata for %s to be cleared", cached.ID)
	}
	sessions, err := store.Sessions(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Fatalf("expected no sessions, got %#v", sessions)
	}
	if parsed, err := LoadPiSessions(piSessionDirForCWD(workspaceRoot)); err == nil && len(parsed) != 0 {
		t.Fatalf("expected session files to be removed, got %#v", parsed)
	}
}

func TestOpenWorkspace(t *testing.T) {
	store := NewMockStore()
	workspace, err := store.OpenWorkspace("/tmp/My Project")
	if err != nil {
		t.Fatal(err)
	}
	if workspace.ID != "my-project" || workspace.Name != "My Project" {
		t.Fatalf("unexpected workspace: %#v", workspace)
	}
}
