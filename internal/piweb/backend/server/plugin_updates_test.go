package server

import (
	"os"
	"path/filepath"
	"strings"
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

func TestDetectPluginUpdateReusesCachedGitCheckout(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	logPath := installFakePluginGit(t, "remote")

	for i := 0; i < 2; i++ {
		status := detectPluginUpdate(pluginManifest{ID: "remote", Source: "github", URL: "owner/repo", Version: "1.0.0"})
		if !status.Checked || !status.UpdateAvailable || status.Error != "" {
			t.Fatalf("status %d = %#v", i, status)
		}
	}

	log, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(log), "clone --depth 1 https://github.com/owner/repo.git") != 1 {
		t.Fatalf("expected one update-check clone, got log:\n%s", string(log))
	}
	if !strings.Contains(string(log), "fetch --depth 1 origin") {
		t.Fatalf("expected cached fetch, got log:\n%s", string(log))
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

func installFakePluginGit(t *testing.T, pluginID string) string {
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
	logPath := filepath.Join(t.TempDir(), "git.log")
	gitScript := `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$PI_WEB_FAKE_GIT_LOG"
if [ "$1" = "clone" ]; then
  dest="$5"
  mkdir -p "$dest/.git"
  cp -R "$PI_WEB_FAKE_GIT_SOURCE"/. "$dest"
  exit 0
fi
if [ "$1" = "-C" ]; then
  exit 0
fi
echo unsupported git command "$*" >&2
exit 2
`
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(gitScript), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("PI_WEB_FAKE_GIT_SOURCE", source)
	t.Setenv("PI_WEB_FAKE_GIT_LOG", logPath)
	return logPath
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
