package piweb

import "testing"

func TestValidateWorkspacePath(t *testing.T) {
	if _, err := ValidateWorkspacePath(""); err == nil {
		t.Fatal("expected empty path to fail")
	}
	if _, err := ValidateWorkspacePath("/tmp/project"); err != nil {
		t.Fatalf("expected valid path: %v", err)
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
