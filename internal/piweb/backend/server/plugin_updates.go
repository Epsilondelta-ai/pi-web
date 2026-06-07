package server

import (
	"crypto/sha256"
	"encoding/hex"
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
	if remote.ID != plugin.ID {
		status.Error = "remote plugin id does not match installed plugin"
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
	remote, err := remoteGitHubPluginManifest(plugin.URL)
	if err != nil {
		return pluginManifest{}, err
	}
	if remote.ID != plugin.ID {
		return pluginManifest{}, errors.New("remote plugin id does not match installed plugin")
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
	cacheDir := pluginUpdateCacheDir(cloneURL)
	if err := syncGitHubPluginUpdateCache(cloneURL, cacheDir); err != nil {
		return pluginManifest{}, err
	}
	return readPluginManifest(cacheDir)
}

func pluginUpdateCacheDir(cloneURL string) string {
	sum := sha256.Sum256([]byte(cloneURL))
	return filepath.Join(pluginMetadataDir(), "update-cache", hex.EncodeToString(sum[:])[:24])
}

func syncGitHubPluginUpdateCache(cloneURL string, cacheDir string) error {
	if _, err := os.Stat(filepath.Join(cacheDir, ".git")); err == nil {
		return refreshGitHubPluginUpdateCache(cacheDir)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(cacheDir), 0o700); err != nil {
		return err
	}
	cmd := exec.Command("git", "clone", "--depth", "1", cloneURL, cacheDir)
	if output, err := cmd.CombinedOutput(); err != nil {
		return errors.New(strings.TrimSpace(string(output)))
	}
	return nil
}

func refreshGitHubPluginUpdateCache(cacheDir string) error {
	fetch := exec.Command("git", "-C", cacheDir, "fetch", "--depth", "1", "origin")
	if output, err := fetch.CombinedOutput(); err != nil {
		return errors.New(strings.TrimSpace(string(output)))
	}
	reset := exec.Command("git", "-C", cacheDir, "reset", "--hard", "FETCH_HEAD")
	if output, err := reset.CombinedOutput(); err != nil {
		return errors.New(strings.TrimSpace(string(output)))
	}
	return nil
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
