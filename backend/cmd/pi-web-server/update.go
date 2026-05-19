package main

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/blang/semver"
	"github.com/rhysd/go-github-selfupdate/selfupdate"
)

const piWebAssetFilter = `^pi-web_`

type binaryUpdater interface {
	UpdateSelf(current semver.Version, slug string) (*selfupdate.Release, error)
}

type githubSelfUpdater struct {
	updater *selfupdate.Updater
}

func runUpdate(out io.Writer, options updateOptions) error {
	updater, err := newGitHubSelfUpdater()
	if err != nil {
		return err
	}
	return runUpdateWithUpdater(out, options, updater)
}

func newGitHubSelfUpdater() (*githubSelfUpdater, error) {
	updater, err := selfupdate.NewUpdater(selfupdate.Config{
		APIToken: os.Getenv("GITHUB_TOKEN"),
		Filters:  []string{piWebAssetFilter},
	})
	if err != nil {
		return nil, err
	}
	return &githubSelfUpdater{updater: updater}, nil
}

func (u *githubSelfUpdater) UpdateSelf(current semver.Version, slug string) (*selfupdate.Release, error) {
	return u.updater.UpdateSelf(current, slug)
}

func runUpdateWithUpdater(out io.Writer, options updateOptions, updater binaryUpdater) error {
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
