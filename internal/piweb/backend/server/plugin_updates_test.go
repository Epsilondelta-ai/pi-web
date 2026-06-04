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
