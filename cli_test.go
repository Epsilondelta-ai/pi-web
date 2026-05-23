package main

import (
	"bytes"
	"io"
	"os"
	"testing"

	"github.com/blang/semver"
	"github.com/rhysd/go-github-selfupdate/selfupdate"
)

func TestRootCommandRunsServerWithDefaults(t *testing.T) {
	var got serverOptions
	cmd := newRootCommand(rootDependencies{
		stdout: io.Discard,
		stderr: io.Discard,
		serve: func(options serverOptions) error {
			got = options
			return nil
		},
		update: func(io.Writer, updateOptions) error {
			t.Fatal("update should not run")
			return nil
		},
	})
	cmd.SetArgs(nil)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute root command: %v", err)
	}

	if got.Host != "0.0.0.0" || got.Port != "8732" || got.Mock {
		t.Fatalf("unexpected server options: %+v", got)
	}
}

func TestRootCommandRunsServerWithFlags(t *testing.T) {
	var got serverOptions
	cmd := newRootCommand(rootDependencies{
		stdout: io.Discard,
		stderr: io.Discard,
		serve: func(options serverOptions) error {
			got = options
			return nil
		},
		update: func(io.Writer, updateOptions) error {
			t.Fatal("update should not run")
			return nil
		},
	})
	cmd.SetArgs([]string{"--host", "0.0.0.0", "--port", "9999", "--mock"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute root command: %v", err)
	}

	if got.Host != "0.0.0.0" || got.Port != "9999" || !got.Mock {
		t.Fatalf("unexpected server options: %+v", got)
	}
}

func TestVersionCommandPrintsVersion(t *testing.T) {
	previousVersion := version
	version = "v1.5.4"
	t.Cleanup(func() { version = previousVersion })

	var out bytes.Buffer
	cmd := newRootCommand(rootDependencies{
		stdout: &out,
		stderr: io.Discard,
		serve: func(serverOptions) error {
			t.Fatal("server should not run")
			return nil
		},
		update: func(io.Writer, updateOptions) error {
			t.Fatal("update should not run")
			return nil
		},
	})
	cmd.SetArgs([]string{"version"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute version command: %v", err)
	}
	if got := out.String(); got != "pi-web v1.5.4\n" {
		t.Fatalf("unexpected version output: %q", got)
	}
}

func TestUpdateCommandUsesCurrentVersionAndRepository(t *testing.T) {
	previousVersion := version
	version = "1.2.3"
	t.Cleanup(func() { version = previousVersion })

	var got updateOptions
	cmd := newRootCommand(rootDependencies{
		stdout: io.Discard,
		stderr: io.Discard,
		serve: func(serverOptions) error {
			t.Fatal("server should not run")
			return nil
		},
		update: func(_ io.Writer, options updateOptions) error {
			got = options
			return nil
		},
	})
	cmd.SetArgs([]string{"update"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute update command: %v", err)
	}

	if got.CurrentVersion != "1.2.3" || got.RepositorySlug != githubRepositorySlug {
		t.Fatalf("unexpected update options: %+v", got)
	}
}

func TestRunUpdateRejectsDevelopmentVersion(t *testing.T) {
	fake := &fakeBinaryUpdater{}
	err := runUpdateWithUpdater(io.Discard, updateOptions{
		CurrentVersion: "dev",
		RepositorySlug: "owner/repo",
	}, fake)

	if err == nil {
		t.Fatal("expected error")
	}
	if fake.called {
		t.Fatal("updater should not run for development version")
	}
}

func TestRunUpdateReportsAlreadyCurrent(t *testing.T) {
	fake := &fakeBinaryUpdater{releaseVersion: semver.MustParse("1.2.3")}
	var out bytes.Buffer

	if err := runUpdateWithUpdater(&out, updateOptions{
		CurrentVersion: "v1.2.3",
		RepositorySlug: "owner/repo",
	}, fake); err != nil {
		t.Fatalf("run update: %v", err)
	}

	if fake.current.String() != "1.2.3" || fake.slug != "owner/repo" {
		t.Fatalf("unexpected updater args: current=%s slug=%s", fake.current, fake.slug)
	}
	if got := out.String(); got != "pi-web 1.2.3 is already up to date\n" {
		t.Fatalf("unexpected output: %q", got)
	}
}

func TestGitHubUpdaterDownloadsFromBrowserAssetURL(t *testing.T) {
	cmd, err := os.CreateTemp(t.TempDir(), "pi-web")
	if err != nil {
		t.Fatalf("create temp command: %v", err)
	}
	if err := cmd.Close(); err != nil {
		t.Fatalf("close temp command: %v", err)
	}

	assetURL := "https://github.com/owner/repo/releases/download/v1.2.4/pi-web_1.2.4_linux_arm64.tar.gz"
	var gotAssetURL string
	var gotCmdPath string
	updater := &githubSelfUpdater{
		detector: &fakeReleaseDetector{release: &selfupdate.Release{
			Version:  semver.MustParse("1.2.4"),
			AssetURL: assetURL,
		}},
		updateTo: func(assetURL, cmdPath string) error {
			gotAssetURL = assetURL
			gotCmdPath = cmdPath
			return nil
		},
	}

	release, err := updater.updateCommand(cmd.Name(), semver.MustParse("1.2.3"), "owner/repo")
	if err != nil {
		t.Fatalf("update command: %v", err)
	}

	if !release.Version.Equals(semver.MustParse("1.2.4")) {
		t.Fatalf("unexpected release: %s", release.Version)
	}
	if gotAssetURL != assetURL {
		t.Fatalf("expected browser asset URL %q, got %q", assetURL, gotAssetURL)
	}
	if gotCmdPath != cmd.Name() {
		t.Fatalf("expected command path %q, got %q", cmd.Name(), gotCmdPath)
	}
}

func TestRunUpdateReportsUpdatedVersion(t *testing.T) {
	fake := &fakeBinaryUpdater{
		releaseVersion: semver.MustParse("1.2.4"),
		releaseURL:     "https://github.com/Epsilondelta-ai/pi-web/releases/tag/v1.2.4",
	}
	var out bytes.Buffer

	if err := runUpdateWithUpdater(&out, updateOptions{
		CurrentVersion: "1.2.3",
		RepositorySlug: "owner/repo",
	}, fake); err != nil {
		t.Fatalf("run update: %v", err)
	}

	want := "Updated pi-web from 1.2.3 to 1.2.4\n" +
		"Release: https://github.com/Epsilondelta-ai/pi-web/releases/tag/v1.2.4\n"
	if got := out.String(); got != want {
		t.Fatalf("unexpected output: %q", got)
	}
}

type fakeReleaseDetector struct {
	release *selfupdate.Release
	found   bool
	err     error
}

func (f *fakeReleaseDetector) DetectLatest(string) (*selfupdate.Release, bool, error) {
	if f.err != nil {
		return nil, false, f.err
	}
	if f.release == nil {
		return nil, f.found, nil
	}
	return f.release, true, nil
}

type fakeBinaryUpdater struct {
	called         bool
	current        semver.Version
	slug           string
	releaseVersion semver.Version
	releaseURL     string
	err            error
}

func (f *fakeBinaryUpdater) UpdateSelf(current semver.Version, slug string) (*selfupdate.Release, error) {
	f.called = true
	f.current = current
	f.slug = slug
	if f.err != nil {
		return nil, f.err
	}
	return &selfupdate.Release{Version: f.releaseVersion, URL: f.releaseURL}, nil
}
