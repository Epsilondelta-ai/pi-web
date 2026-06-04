package server

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/blang/semver"
)

func detectPluginUpdates() ([]pluginUpdateStatus, error) {
	plugins, err := listPluginManifests()
	if err != nil {
		return nil, err
	}
	statuses := make([]pluginUpdateStatus, 0, len(plugins))
	for _, plugin := range plugins {
		statuses = append(statuses, detectPluginUpdate(plugin))
	}
	return statuses, nil
}

func detectPluginUpdate(plugin pluginManifest) pluginUpdateStatus {
	status := pluginUpdateStatus{ID: plugin.ID, Source: plugin.Source, CurrentVersion: plugin.Version}
	if plugin.Source != "github" || strings.TrimSpace(plugin.URL) == "" {
		return status
	}
	remote, err := remoteGitHubPluginManifest(plugin.URL)
	if err != nil {
		status.Error = err.Error()
		return status
	}
	status.Checked = true
	status.LatestVersion = remote.Version
	status.UpdateAvailable = isRemotePluginVersionNewer(plugin.Version, remote.Version)
	return status
}

func updateGitHubPlugin(id string) (pluginManifest, error) {
	id = cleanPluginID(id)
	if id == "" {
		return pluginManifest{}, errors.New("invalid plugin id")
	}
	plugin, err := readPluginManifest(filepath.Join(pluginRoot(), id))
	if err != nil {
		return pluginManifest{}, err
	}
	if plugin.Source != "github" || strings.TrimSpace(plugin.URL) == "" {
		return pluginManifest{}, errors.New("plugin is not installed from GitHub")
	}
	updated, err := installGitHubPlugin(plugin.URL)
	if err != nil {
		return pluginManifest{}, err
	}
	if !plugin.Enabled {
		if err := setPluginEnabled(updated.ID, false); err != nil {
			return pluginManifest{}, err
		}
	}
	return readPluginManifest(filepath.Join(pluginRoot(), updated.ID))
}

func remoteGitHubPluginManifest(rawURL string) (pluginManifest, error) {
	cloneURL, err := normalizeGitHubPluginURL(rawURL)
	if err != nil {
		return pluginManifest{}, err
	}
	tempDir, err := os.MkdirTemp("", "pi-web-plugin-update-*")
	if err != nil {
		return pluginManifest{}, err
	}
	defer os.RemoveAll(tempDir)
	cmd := exec.Command("git", "clone", "--depth", "1", cloneURL, tempDir)
	if output, err := cmd.CombinedOutput(); err != nil {
		return pluginManifest{}, errors.New(strings.TrimSpace(string(output)))
	}
	return readPluginManifest(tempDir)
}

func isRemotePluginVersionNewer(current string, latest string) bool {
	currentVersion, currentOK := parsePluginSemver(current)
	latestVersion, latestOK := parsePluginSemver(latest)
	return currentOK && latestOK && latestVersion.GT(currentVersion)
}

func parsePluginSemver(value string) (semver.Version, bool) {
	version := strings.TrimPrefix(strings.TrimSpace(value), "v")
	if version == "" || version == "dev" {
		return semver.Version{}, false
	}
	parsed, err := semver.Parse(version)
	if err != nil {
		return semver.Version{}, false
	}
	return parsed, true
}
