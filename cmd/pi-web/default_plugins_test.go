package main

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDefaultPluginOptionsFromEnv(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("PI_WEB_INSTALL_DEFAULT_PLUGINS", "always")
	t.Setenv("PI_WEB_DEFAULT_PLUGIN_URLS", "one two")

	options := defaultPluginInstallOptionsFromEnv()
	if options.Mode != "always" || strings.Join(options.URLs, ",") != "one,two" {
		t.Fatalf("unexpected options: %+v", options)
	}
	if options.PluginRoot != filepath.Join(home, ".pi-web", "plugins") {
		t.Fatalf("unexpected plugin root: %s", options.PluginRoot)
	}
}

func TestHasInstalledPlugins(t *testing.T) {
	root := t.TempDir()
	if hasInstalledPlugins(filepath.Join(root, "missing")) {
		t.Fatal("missing root should not have plugins")
	}
	if err := os.MkdirAll(filepath.Join(root, ".metadata"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "empty"), 0o700); err != nil {
		t.Fatal(err)
	}
	if hasInstalledPlugins(root) {
		t.Fatal("metadata and empty dirs should not count")
	}
	if err := os.MkdirAll(filepath.Join(root, "chat"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "chat", "plugin.json"), []byte(`{"id":"chat"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if !hasInstalledPlugins(root) {
		t.Fatal("plugin.json dir should count")
	}
}

func TestInstallDefaultPluginsModeBranches(t *testing.T) {
	root := t.TempDir()
	var out bytes.Buffer
	if err := installDefaultPluginsIfNeeded(&out, defaultPluginInstallOptions{Mode: "bogus", PluginRoot: root}); err == nil {
		t.Fatal("expected invalid mode error")
	}
	if err := installDefaultPluginsIfNeeded(&out, defaultPluginInstallOptions{Mode: "never", PluginRoot: root}); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "chat"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "chat", "plugin.json"), []byte(`{"id":"chat"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := installDefaultPluginsIfNeeded(&out, defaultPluginInstallOptions{Mode: "auto", PluginRoot: root}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Default plugins already present") {
		t.Fatalf("missing skip output: %q", out.String())
	}
}

func TestInstallDefaultPluginsWithoutGit(t *testing.T) {
	pathKey := "PATH"
	if runtime.GOOS == "windows" {
		pathKey = "Path"
	}
	t.Setenv(pathKey, t.TempDir())
	var out bytes.Buffer
	if err := installDefaultPluginsIfNeeded(&out, defaultPluginInstallOptions{Mode: "auto", PluginRoot: t.TempDir()}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "git not found") {
		t.Fatalf("missing git skip output: %q", out.String())
	}
	if err := installDefaultPluginsIfNeeded(&out, defaultPluginInstallOptions{Mode: "always", PluginRoot: t.TempDir()}); err == nil {
		t.Fatal("expected git error")
	}
}

func TestInstallDefaultPluginsInstallsAndWarns(t *testing.T) {
	installFakeGit(t)
	root := t.TempDir()
	var out bytes.Buffer
	err := installDefaultPluginsIfNeeded(&out, defaultPluginInstallOptions{
		Mode:       "auto",
		PluginRoot: root,
		URLs:       []string{"https://example.com/ok-plugin", "https://example.com/fail", "https://example.com/missing", "https://example.com/badid"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "ok-plugin", "index.js")); err != nil {
		t.Fatalf("default plugin not installed: %v output=%q entries=%q", err, out.String(), listTestTree(t, root))
	}
	metadata, err := os.ReadFile(filepath.Join(root, ".metadata", "ok-plugin.json"))
	if err != nil || !strings.Contains(string(metadata), "https://example.com/ok-plugin") {
		t.Fatalf("metadata = %q err = %v", string(metadata), err)
	}
	text := out.String()
	for _, want := range []string{"Installed default plugin", "failed to clone", "missing plugin.json", "invalid plugin id"} {
		if !strings.Contains(text, want) {
			t.Fatalf("output missing %q: %s", want, text)
		}
	}
}

func TestInstallDefaultPluginsAlwaysStopsOnFailure(t *testing.T) {
	installFakeGit(t)
	err := installDefaultPluginsIfNeeded(&bytes.Buffer{}, defaultPluginInstallOptions{
		Mode:       "always",
		PluginRoot: t.TempDir(),
		URLs:       []string{"https://example.com/fail"},
	})
	if err == nil || !strings.Contains(err.Error(), "failed to clone") {
		t.Fatalf("expected clone error, got %v", err)
	}
}

func TestDefaultPluginManifestAndMetadataErrors(t *testing.T) {
	root := t.TempDir()
	invalidJSON := filepath.Join(root, "invalid.json")
	if err := os.WriteFile(invalidJSON, []byte(`{`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readDefaultPluginManifest(invalidJSON); err == nil {
		t.Fatal("expected invalid json error")
	}
	if cleanDefaultPluginID("ok") != "ok" || cleanDefaultPluginID("bad/name") != "" || cleanDefaultPluginID("") != "" || cleanDefaultPluginID(".") != "" {
		t.Fatal("unexpected clean id result")
	}
	metadataPath := filepath.Join(root, "metadata.json")
	if err := os.WriteFile(metadataPath, []byte(`exists`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeDefaultPluginMetadata(metadataPath, "url"); err != nil {
		t.Fatal(err)
	}
	if err := writeDefaultPluginMetadata(filepath.Join(root, "missing", "metadata.json"), "url"); err == nil {
		t.Fatal("expected metadata write error")
	}
}

func TestInstallDefaultPluginFilesystemErrors(t *testing.T) {
	installFakeGit(t)
	fileRoot := filepath.Join(t.TempDir(), "not-dir")
	if err := os.WriteFile(fileRoot, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := installDefaultPlugins(&bytes.Buffer{}, defaultPluginInstallOptions{Mode: "auto", PluginRoot: fileRoot, URLs: []string{"https://example.com/ok-plugin"}}); err == nil {
		t.Fatal("expected metadata mkdir error")
	}
	if err := copyDefaultPluginDir(filepath.Join(t.TempDir(), "missing"), filepath.Join(t.TempDir(), "target")); err == nil {
		t.Fatal("expected copy missing source error")
	}
}

func listTestTree(t *testing.T, root string) string {
	t.Helper()
	var entries []string
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil || rel == "." {
			return nil
		}
		entries = append(entries, rel)
		return nil
	})
	return strings.Join(entries, ",")
}

func installFakeGit(t *testing.T) {
	t.Helper()
	bin := t.TempDir()
	script := `#!/bin/sh
set -eu
url="$4"
dest="$5"
case "$url" in
  *fail*) echo clone failed >&2; exit 1 ;;
  *missing*) mkdir -p "$dest"; exit 0 ;;
  *badid*) mkdir -p "$dest"; printf '{"id":"../bad","entry":"index.js"}' > "$dest/plugin.json"; exit 0 ;;
esac
id="$(basename "$url")"
mkdir -p "$dest/nested"
printf '{"id":"%s","entry":"index.js"}' "$id" > "$dest/plugin.json"
printf 'export default () => {};\n' > "$dest/index.js"
printf 'nested\n' > "$dest/nested/file.txt"
`
	name := "git"
	if runtime.GOOS == "windows" {
		name = "git.bat"
		script = "@echo off\r\nexit /b 1\r\n"
	}
	if err := os.WriteFile(filepath.Join(bin, name), []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
}
