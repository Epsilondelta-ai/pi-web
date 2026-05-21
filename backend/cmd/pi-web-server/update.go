package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/blang/semver"
	"github.com/rhysd/go-github-selfupdate/selfupdate"

	"pi-web-ui/backend/internal/piweb"
)

const piWebAssetFilter = `^pi-web_`

type binaryUpdater interface {
	UpdateSelf(current semver.Version, slug string) (*selfupdate.Release, error)
}

type releaseDetector interface {
	DetectLatest(slug string) (*selfupdate.Release, bool, error)
}

type githubSelfUpdater struct {
	detector   releaseDetector
	updateTo   func(assetURL, cmdPath string) error
	executable func() (string, error)
}

var (
	newSelfUpdater = func() (binaryUpdater, error) {
		return newGitHubSelfUpdater()
	}
	newReleaseDetector = func() (releaseDetector, error) {
		return newGitHubSelfUpdater()
	}
	newSelfupdateUpdater = selfupdate.NewUpdater
)

func runUpdate(out io.Writer, options updateOptions) error {
	updater, err := newSelfUpdater()
	if err != nil {
		return err
	}
	return runUpdateWithUpdater(out, options, updater)
}

func detectReleaseStatus(_ context.Context, currentVersion string) (piweb.VersionStatus, error) {
	status := piweb.VersionStatus{CurrentVersion: currentVersion}
	current, err := parseCurrentVersion(currentVersion)
	if err != nil {
		return status, nil
	}

	detector, err := newReleaseDetector()
	if err != nil {
		return status, err
	}
	release, found, err := detector.DetectLatest(githubRepositorySlug)
	if err != nil || !found {
		return status, err
	}

	status.LatestVersion = release.Version.String()
	status.UpdateAvailable = !release.Version.Equals(current)
	return status, nil
}

func newGitHubSelfUpdater() (*githubSelfUpdater, error) {
	updater, err := newSelfupdateUpdater(selfupdate.Config{
		APIToken: os.Getenv("GITHUB_TOKEN"),
		Filters:  []string{piWebAssetFilter},
	})
	if err != nil {
		return nil, err
	}
	return &githubSelfUpdater{
		detector:   updater,
		updateTo:   selfupdate.UpdateTo,
		executable: os.Executable,
	}, nil
}

func (u *githubSelfUpdater) UpdateSelf(current semver.Version, slug string) (*selfupdate.Release, error) {
	cmdPath, err := u.executable()
	if err != nil {
		return nil, err
	}
	return u.updateCommand(cmdPath, current, slug)
}

func (u *githubSelfUpdater) updateCommand(cmdPath string, current semver.Version, slug string) (*selfupdate.Release, error) {
	cmdPath = commandPathForGOOS(runtime.GOOS, cmdPath)
	stat, err := os.Lstat(cmdPath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat %q: %w", cmdPath, err)
	}
	if stat.Mode()&os.ModeSymlink != 0 {
		cmdPath, err = filepath.EvalSymlinks(cmdPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve symlink %q: %w", cmdPath, err)
		}
	}

	release, found, err := u.detector.DetectLatest(slug)
	if err != nil {
		return nil, err
	}
	if !found || release.Version.Equals(current) {
		return &selfupdate.Release{Version: current}, nil
	}
	if err := u.updateTo(release.AssetURL, cmdPath); err != nil {
		return nil, err
	}
	return release, nil
}

func commandPathForGOOS(goos string, cmdPath string) string {
	if goos == "windows" && !strings.HasSuffix(cmdPath, ".exe") {
		return cmdPath + ".exe"
	}
	return cmdPath
}

func (u *githubSelfUpdater) DetectLatest(slug string) (*selfupdate.Release, bool, error) {
	return u.detector.DetectLatest(slug)
}

func runUpdateWithUpdater(out io.Writer, options updateOptions, updater binaryUpdater) error {
	if options.Installer == "npm" {
		fmt.Fprintln(out, "pi-web was installed with npm; update it with:")
		fmt.Fprintln(out, "  npm update -g @epsilondelta-ai/pi-web")
		return nil
	}

	current, err := parseCurrentVersion(options.CurrentVersion)
	if err != nil {
		return err
	}

	release, err := updater.UpdateSelf(current, options.RepositorySlug)
	if err != nil {
		return err
	}
	if release.Version.Equals(current) {
		fmt.Fprintf(out, "pi-web %s is already up to date\n", current)
		return nil
	}

	fmt.Fprintf(out, "Updated pi-web from %s to %s\n", current, release.Version)
	if release.URL != "" {
		fmt.Fprintf(out, "Release: %s\n", release.URL)
	}
	return nil
}

func parseCurrentVersion(value string) (semver.Version, error) {
	trimmed := strings.TrimSpace(value)
	trimmed = strings.TrimPrefix(trimmed, "v")
	if trimmed == "" || trimmed == "dev" {
		return semver.Version{}, fmt.Errorf(
			"pi-web update requires a release build with a semver version; current version is %q",
			value,
		)
	}

	version, err := semver.Parse(trimmed)
	if err != nil {
		return semver.Version{}, fmt.Errorf("parse current version %q: %w", value, err)
	}
	return version, nil
}
