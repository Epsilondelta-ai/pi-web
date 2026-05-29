package piweb

import "testing"

func TestParseGitStatusPorcelain(t *testing.T) {
	status := ParseGitStatusPorcelain([]byte(" M src/main.go\x00A  src/add.go\x00?? scratch.txt\x00D  old.txt\x00R  new/name.go\x00old/name.go\x00"))
	expected := map[string]string{
		"src/main.go": "modified",
		"src/add.go":  "added",
		"scratch.txt": "untracked",
		"old.txt":     "deleted",
		"new/name.go": "renamed",
		"old/name.go": "deleted",
	}
	if len(status) != len(expected) {
		t.Fatalf("unexpected status count: %#v", status)
	}
	for path, kind := range expected {
		if status[path] != kind {
			t.Fatalf("%s: expected %s, got %#v", path, kind, status)
		}
	}
}

func TestParseGitStatusPorcelainClean(t *testing.T) {
	status := ParseGitStatusPorcelain(nil)
	if len(status) != 0 {
		t.Fatalf("expected no statuses: %#v", status)
	}
}
