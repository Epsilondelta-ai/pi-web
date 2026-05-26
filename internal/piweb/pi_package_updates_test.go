package piweb

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDetectPiPackageUpdateStatusFindsUnpinnedNpmUpdates(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test")
	}
	root := t.TempDir()
	home := t.TempDir()
	oldHome := os.Getenv("HOME")
	t.Setenv("HOME", home)
	defer os.Setenv("HOME", oldHome)
	oldWd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(oldWd)

	fakeNpm := filepath.Join(root, "fake-npm")
	if err := os.WriteFile(fakeNpm, []byte("#!/bin/sh\nprintf '\"2.0.0\"\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeJSONFile(t, filepath.Join(root, ".pi", "settings.json"), `{"packages":["npm:@example/pkg"],"npmCommand":["`+fakeNpm+`"]}`)
	writeJSONFile(t, filepath.Join(root, ".pi", "npm", "node_modules", "@example", "pkg", "package.json"), `{"version":"1.0.0"}`)
	writeJSONFile(t, filepath.Join(home, ".pi", "agent", "settings.json"), `{"packages":["npm:@example/pkg","npm:pinned@1.0.0"]}`)

	status, err := DetectPiPackageUpdateStatus(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(status.Updates) != 1 {
		t.Fatalf("expected one update, got %#v", status.Updates)
	}
	update := status.Updates[0]
	if update.Source != "npm:@example/pkg" || update.DisplayName != "@example/pkg" || update.CurrentVersion != "1.0.0" || update.LatestVersion != "2.0.0" || update.Scope != "project" {
		t.Fatalf("unexpected update: %#v", update)
	}
}

func TestDetectPiPackageUpdateStatusSkipsOffline(t *testing.T) {
	t.Setenv("PI_OFFLINE", "1")
	status, err := DetectPiPackageUpdateStatus(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(status.Updates) != 0 {
		t.Fatalf("expected no offline updates, got %#v", status.Updates)
	}
}

func TestParseNpmPiPackageSource(t *testing.T) {
	name, pinned, ok := parseNpmPiPackageSource("npm:@scope/pkg@1.2.3")
	if !ok || !pinned || name != "@scope/pkg" {
		t.Fatalf("unexpected scoped parse: %q %v %v", name, pinned, ok)
	}
	name, pinned, ok = parseNpmPiPackageSource("npm:plain")
	if !ok || pinned || name != "plain" {
		t.Fatalf("unexpected plain parse: %q %v %v", name, pinned, ok)
	}
	if _, _, ok = parseNpmPiPackageSource("git:example"); ok {
		t.Fatal("expected non-npm source to be ignored")
	}
}

func writeJSONFile(t *testing.T, path string, content string) {
	t.Helper()
	if strings.TrimSpace(content) == "" {
		t.Fatal("empty content")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
