package piweb

import (
	"os"
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

func TestCreateSession(t *testing.T) {
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
	file, cwd, ok := store.SessionRuntime(session.ID)
	if !ok || cwd != workspaceRoot {
		t.Fatalf("missing runtime: %q %q %v", file, cwd, ok)
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatal(err)
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
