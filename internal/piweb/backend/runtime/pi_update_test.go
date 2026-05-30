package runtime

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestPiUpdaterStatusResetsAfterRead(t *testing.T) {
	var called atomic.Int32
	runner := func(_ context.Context, _ string, _ string) error {
		called.Add(1)
		return nil
	}
	u := NewPiUpdater(runner)

	// Start an update
	result := u.Start(context.Background(), "", "")
	if result.State != PiUpdateUpdating {
		t.Fatalf("expected updating, got %q", result.State)
	}

	// Wait for completion
	time.Sleep(100 * time.Millisecond)

	// First read should return "updated" and reset to idle
	status1 := u.Status()
	if status1.State != PiUpdateUpdated {
		t.Fatalf("expected updated, got %q", status1.State)
	}

	// Second read should return idle (reset)
	status2 := u.Status()
	if status2.State != PiUpdateIdle {
		t.Fatalf("expected idle after reset, got %q", status2.State)
	}
}

func TestPiUpdaterStatusResetsFailedAfterRead(t *testing.T) {
	runner := func(_ context.Context, _ string, _ string) error {
		return errTestUpdate
	}
	u := NewPiUpdater(runner)

	u.Start(context.Background(), "", "")
	time.Sleep(100 * time.Millisecond)

	status1 := u.Status()
	if status1.State != PiUpdateFailed {
		t.Fatalf("expected failed, got %q", status1.State)
	}

	status2 := u.Status()
	if status2.State != PiUpdateIdle {
		t.Fatalf("expected idle after reset, got %q", status2.State)
	}
}

func TestPiUpdaterRejectsConcurrentStart(t *testing.T) {
	block := make(chan struct{})
	runner := func(_ context.Context, _ string, _ string) error {
		<-block
		return nil
	}
	u := NewPiUpdater(runner)

	u.Start(context.Background(), "", "")

	// Second start while updating should return the existing status
	result := u.Start(context.Background(), "", "")
	if result.State != PiUpdateUpdating {
		t.Fatalf("expected updating on concurrent start, got %q", result.State)
	}

	close(block)
	time.Sleep(50 * time.Millisecond)
}

func TestSyncNpmPackageVersionsUpdatesManifestBeforeInstall(t *testing.T) {
	binDir := t.TempDir()
	writeFakeCommand(t, binDir, "npm", "#!/bin/sh\necho npm:$@ >> \"$PI_TEST_LOG\"\nexit 0\n")
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	logPath := filepath.Join(t.TempDir(), "commands.log")
	t.Setenv("PI_TEST_LOG", logPath)

	npmDir := t.TempDir()
	packageJSON := filepath.Join(npmDir, "package.json")
	if err := os.WriteFile(packageJSON, []byte(`{"name":"pi-extensions","dependencies":{"pkg-a":"^1.0.0"}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	lockPath := filepath.Join(npmDir, "package-lock.json")
	if err := os.WriteFile(lockPath, []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}
	updates := []PiPackageUpdate{{DisplayName: "pkg-a", Type: "npm", LatestVersion: "2.0.0"}}

	if err := syncNpmPackageVersions(context.Background(), npmDir, updates, nil); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(packageJSON)
	if err != nil {
		t.Fatal(err)
	}
	if !bytesContains(content, `"pkg-a": "^2.0.0"`) {
		t.Fatalf("package.json was not updated: %s", content)
	}
	if _, err := os.Stat(lockPath); !os.IsNotExist(err) {
		t.Fatalf("expected package-lock.json to be removed, stat err=%v", err)
	}
	logContent, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(logContent); got != "npm:install --legacy-peer-deps\n" {
		t.Fatalf("unexpected npm command: %q", got)
	}
}

func bytesContains(haystack []byte, needle string) bool {
	return strings.Contains(string(haystack), needle)
}

func writeFakeCommand(t *testing.T, dir string, name string, content string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		name += ".bat"
		content = "@echo off\r\necho npm:%* >> %PI_TEST_LOG%\r\n"
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
}

var errTestUpdate = errors.New("test update error")
