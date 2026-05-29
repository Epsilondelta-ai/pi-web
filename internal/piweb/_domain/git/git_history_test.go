package piweb

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestParseGitHistoryLog(t *testing.T) {
	log := "abcdef1234567890\x1f11111111 22222222\x1fAda\x1fada@example.com\x1f2026-05-23T00:00:00Z\x1fHEAD -> main, tag: v1\x1fMerge work\x1e"
	commits := parseGitHistoryLog(log)
	if len(commits) != 1 {
		t.Fatalf("expected one commit, got %#v", commits)
	}
	commit := commits[0]
	if commit.ShortHash != "abcdef12" || commit.Subject != "Merge work" || len(commit.Parents) != 2 {
		t.Fatalf("unexpected commit: %#v", commit)
	}
	if len(commit.Refs) != 2 || commit.Refs[0] != "main" || commit.Refs[1] != "v1" {
		t.Fatalf("unexpected refs: %#v", commit.Refs)
	}
}

func TestParseGitCommitFiles(t *testing.T) {
	files, additions, deletions := parseGitCommitFiles("M\tapp.go\nR100\told.go\tnew.go\n3\t1\tapp.go\n2\t0\told.go\tnew.go\n")
	if additions != 5 || deletions != 1 || len(files) != 2 {
		t.Fatalf("unexpected stats: files=%#v additions=%d deletions=%d", files, additions, deletions)
	}
	if files[0].Path != "app.go" || files[0].Status != "modified" || files[1].OldPath != "old.go" || files[1].Status != "renamed" {
		t.Fatalf("unexpected files: %#v", files)
	}
}

func TestRealGitHistoryAndDetail(t *testing.T) {
	root := t.TempDir()
	runTestGit(t, root, "init", "-b", "main")
	runTestGit(t, root, "config", "user.email", "test@example.com")
	runTestGit(t, root, "config", "user.name", "Test User")
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("one\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, root, "add", "README.md")
	runTestGit(t, root, "commit", "-m", "initial")
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("one\ntwo\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, root, "commit", "-am", "update readme")

	commits, err := RealGitHistory(context.Background(), root, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(commits) != 2 || commits[0].Subject != "update readme" || commits[0].Additions == 0 {
		t.Fatalf("unexpected commits: %#v", commits)
	}
	detail, err := RealGitCommitDetail(context.Background(), root, commits[0].Hash)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Commit.ShortHash != commits[0].ShortHash || detail.Body != "update readme" || detail.Diff == "" {
		t.Fatalf("unexpected detail: %#v", detail)
	}
}

func runTestGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, out)
	}
}
