package server

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectPluginUpdateSkipsLocalPlugins(t *testing.T) {
	status := detectPluginUpdate(pluginManifest{ID: "local", Source: "local", Version: "1.0.0"})
	if status.ID != "local" || status.Checked || status.UpdateAvailable || status.Error != "" {
		t.Fatalf("status = %#v", status)
	}
}

func TestDetectPluginUpdateReportsRemoteErrors(t *testing.T) {
	bin := filepath.Join(t.TempDir(), "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	gitScript := "#!/bin/sh\necho clone failed >&2\nexit 42\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(gitScript), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	status := detectPluginUpdate(pluginManifest{ID: "remote", Source: "github", URL: "owner/repo", Version: "1.0.0"})
	if status.Checked || status.UpdateAvailable || status.Error == "" {
		t.Fatalf("status = %#v", status)
	}
}

func TestDetectPluginUpdateRejectsRemoteIDMismatch(t *testing.T) {
	installFakePluginGit(t, "other-plugin")

	status := detectPluginUpdate(pluginManifest{ID: "remote", Source: "github", URL: "owner/repo", Version: "1.0.0"})
	if status.Checked || status.UpdateAvailable || status.Error == "" {
		t.Fatalf("status = %#v", status)
	}
}

func TestUpdateGitHubPluginRejectsRemoteIDMismatchBeforeInstall(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	installFakePluginGit(t, "other-plugin")
	installed := filepath.Join(pluginRoot(), "remote")
	if err := os.MkdirAll(installed, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installed, "plugin.json"), []byte(`{"id":"remote","version":"1.0.0","entry":"index.js"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installed, "index.js"), []byte("export default () => {};"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writePluginMetadata("remote", pluginInstallMetadata{Source: "github", URL: "owner/repo"}); err != nil {
		t.Fatal(err)
	}

	if _, err := updateGitHubPlugin("remote"); err == nil {
		t.Fatal("updateGitHubPlugin succeeded with mismatched remote id")
	}
	if _, err := os.Stat(filepath.Join(pluginRoot(), "other-plugin")); !os.IsNotExist(err) {
		t.Fatalf("mismatched remote plugin was installed: %v", err)
	}
}

func installFakePluginGit(t *testing.T, pluginID string) {
	t.Helper()
	source := filepath.Join(t.TempDir(), "repo")
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := `{"id":"` + pluginID + `","version":"2.0.0","entry":"index.js"}`
	if err := os.WriteFile(filepath.Join(source, "plugin.json"), []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "index.js"), []byte("export default () => {};"), 0o600); err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(t.TempDir(), "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	gitScript := "#!/bin/sh\nset -eu\ndest=\"$5\"\nmkdir -p \"$dest\"\ncp -R \"$PI_WEB_FAKE_GIT_SOURCE\"/. \"$dest\"\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(gitScript), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("PI_WEB_FAKE_GIT_SOURCE", source)
}

func TestRemotePluginVersionComparison(t *testing.T) {
	cases := []struct {
		name    string
		current string
		latest  string
		want    bool
	}{
		{name: "newer", current: "1.0.0", latest: "1.0.1", want: true},
		{name: "same", current: "1.0.0", latest: "1.0.0", want: false},
		{name: "older", current: "1.0.1", latest: "1.0.0", want: false},
		{name: "dev", current: "dev", latest: "1.0.0", want: false},
		{name: "invalid", current: "1", latest: "2", want: false},
		{name: "v-prefix", current: "v1.0.0", latest: "v1.1.0", want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isRemotePluginVersionNewer(tc.current, tc.latest)
			if got != tc.want {
				t.Fatalf("isRemotePluginVersionNewer(%q, %q) = %v, want %v", tc.current, tc.latest, got, tc.want)
			}
		})
	}
}
