package backend

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDetectGlobalPackageUpdates(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)

	fakeNpm := filepath.Join(t.TempDir(), "fake-npm")
	if err := os.WriteFile(fakeNpm, []byte("#!/bin/sh\nprintf '\"2.0.0\"\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeJSONFile(t, filepath.Join(home, ".pi", "agent", "settings.json"), `{"packages":["npm:@example/global-pkg","npm:pinned@1.0.0"],"npmCommand":["`+fakeNpm+`"]}`)
	writeJSONFile(t, filepath.Join(home, ".pi", "agent", "npm", "node_modules", "@example", "global-pkg", "package.json"), `{"version":"1.0.0"}`)

	status, err := DetectGlobalPackageUpdates(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if status.Scope != "global" {
		t.Fatalf("expected global scope, got %q", status.Scope)
	}
	if len(status.Updates) != 1 {
		t.Fatalf("expected one global update, got %#v", status.Updates)
	}
	update := status.Updates[0]
	if update.Source != "npm:@example/global-pkg" || update.Scope != "user" {
		t.Fatalf("unexpected update: %#v", update)
	}
}

func TestDetectWorkspacePackageUpdates(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)

	fakeNpm := filepath.Join(t.TempDir(), "fake-npm")
	if err := os.WriteFile(fakeNpm, []byte("#!/bin/sh\nprintf '\"2.0.0\"\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeJSONFile(t, filepath.Join(home, ".pi", "agent", "settings.json"), `{"npmCommand":["`+fakeNpm+`"]}`)

	wsDir := filepath.Join(t.TempDir(), "my-workspace")
	writeJSONFile(t, filepath.Join(wsDir, ".pi", "settings.json"), `{"packages":["npm:@example/ws-pkg"]}`)
	writeJSONFile(t, filepath.Join(wsDir, ".pi", "npm", "node_modules", "@example", "ws-pkg", "package.json"), `{"version":"1.0.0"}`)

	status, err := DetectWorkspacePackageUpdates(context.Background(), wsDir)
	if err != nil {
		t.Fatal(err)
	}
	if status.Scope != "workspace" {
		t.Fatalf("expected workspace scope, got %q", status.Scope)
	}
	if len(status.Updates) != 1 {
		t.Fatalf("expected one workspace update, got %#v", status.Updates)
	}
	update := status.Updates[0]
	if update.Source != "npm:@example/ws-pkg" || update.Scope != "project" {
		t.Fatalf("unexpected update: %#v", update)
	}
}

func TestDetectWorkspacePackageUpdatesIgnoresPinned(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)

	fakeNpm := filepath.Join(t.TempDir(), "fake-npm")
	if err := os.WriteFile(fakeNpm, []byte("#!/bin/sh\nprintf '\"2.0.0\"\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeJSONFile(t, filepath.Join(home, ".pi", "agent", "settings.json"), `{"npmCommand":["`+fakeNpm+`"]}`)

	wsDir := filepath.Join(t.TempDir(), "ws")
	writeJSONFile(t, filepath.Join(wsDir, ".pi", "settings.json"), `{"packages":["npm:@example/pkg@1.0.0"]}`)
	writeJSONFile(t, filepath.Join(wsDir, ".pi", "npm", "node_modules", "@example", "pkg", "package.json"), `{"version":"1.0.0"}`)

	status, err := DetectWorkspacePackageUpdates(context.Background(), wsDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(status.Updates) != 0 {
		t.Fatalf("expected no updates for pinned package, got %#v", status.Updates)
	}
}

func TestDetectGlobalUpdatesSkipsOffline(t *testing.T) {
	t.Setenv("PI_OFFLINE", "1")
	status, err := DetectGlobalPackageUpdates(context.Background())
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
