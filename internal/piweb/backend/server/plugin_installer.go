package server

import (
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func installPluginRequest(body pluginInstallRequest) (pluginManifest, error) {
	source := strings.TrimSpace(body.Source)
	if source == "" {
		source = "local"
	}
	if source == "github" {
		return installGitHubPlugin(body.URL)
	}
	if source != "local" {
		return pluginManifest{}, errors.New("plugin source must be local or github")
	}
	return installLocalPlugin(body.Path)
}

func installGitHubPlugin(rawURL string) (pluginManifest, error) {
	cloneURL, err := normalizeGitHubPluginURL(rawURL)
	if err != nil {
		return pluginManifest{}, err
	}
	tempDir, err := os.MkdirTemp("", "pi-web-plugin-*")
	if err != nil {
		return pluginManifest{}, err
	}
	defer os.RemoveAll(tempDir)
	cmd := exec.Command("git", "clone", "--depth", "1", cloneURL, tempDir)
	if output, err := cmd.CombinedOutput(); err != nil {
		return pluginManifest{}, errors.New(strings.TrimSpace(string(output)))
	}
	plugin, err := readPluginManifest(tempDir)
	if err != nil {
		return pluginManifest{}, err
	}
	root := pluginRoot()
	if err := os.MkdirAll(root, 0o700); err != nil {
		return pluginManifest{}, err
	}
	target := filepath.Join(root, plugin.ID)
	if err := os.RemoveAll(target); err != nil {
		return pluginManifest{}, err
	}
	if err := copyPluginDir(tempDir, target); err != nil {
		return pluginManifest{}, err
	}
	metadata := readPluginMetadata(target, plugin.ID)
	metadata.Source = "github"
	metadata.URL = cloneURL
	if err := writePluginMetadata(plugin.ID, metadata); err != nil {
		return pluginManifest{}, err
	}
	return readPluginManifest(target)
}

func installLocalPlugin(source string) (pluginManifest, error) {
	if strings.TrimSpace(source) == "" {
		return pluginManifest{}, errors.New("plugin path is required")
	}
	abs, err := filepath.Abs(source)
	if err != nil {
		return pluginManifest{}, err
	}
	plugin, err := readPluginManifest(abs)
	if err != nil {
		return pluginManifest{}, err
	}
	root := pluginRoot()
	if err := os.MkdirAll(root, 0o700); err != nil {
		return pluginManifest{}, err
	}
	target := filepath.Join(root, plugin.ID)
	if err := os.RemoveAll(target); err != nil {
		return pluginManifest{}, err
	}
	if err := os.Symlink(abs, target); err != nil {
		if err := copyPluginDir(abs, target); err != nil {
			return pluginManifest{}, err
		}
	}
	metadata := readPluginMetadata(target, plugin.ID)
	metadata.Source = "local"
	metadata.Path = abs
	if err := writePluginMetadata(plugin.ID, metadata); err != nil {
		return pluginManifest{}, err
	}
	return readPluginManifest(target)
}

func reloadGitHubPlugins() ([]pluginManifest, error) {
	plugins, err := listPluginManifests()
	if err != nil {
		return nil, err
	}
	for _, plugin := range plugins {
		if plugin.Source != "github" || strings.TrimSpace(plugin.URL) == "" {
			continue
		}
		updated, err := installGitHubPlugin(plugin.URL)
		if err != nil {
			return nil, err
		}
		if !plugin.Enabled {
			if err := setPluginEnabled(updated.ID, false); err != nil {
				return nil, err
			}
		}
	}
	return listPluginManifests()
}

func normalizeGitHubPluginURL(rawURL string) (string, error) {
	value := strings.TrimSpace(rawURL)
	if value == "" {
		return "", errors.New("github URL is required")
	}
	if strings.HasPrefix(value, "git@github.com:") {
		return value, nil
	}
	if strings.HasPrefix(value, "https://github.com/") || strings.HasPrefix(value, "http://github.com/") {
		return value, nil
	}
	parts := strings.Split(value, "/")
	if len(parts) == 2 && cleanPluginID(parts[0]) != "" && cleanPluginID(strings.TrimSuffix(parts[1], ".git")) != "" {
		return "https://github.com/" + value + ".git", nil
	}
	return "", errors.New("github URL must be a GitHub URL or owner/repo")
}

func copyPluginDir(source string, target string) error {
	if err := os.MkdirAll(target, 0o700); err != nil {
		return err
	}
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(source, path)
		if err != nil || rel == "." {
			return err
		}
		dest := filepath.Join(target, rel)
		if entry.IsDir() {
			return os.MkdirAll(dest, 0o700)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(dest, data, 0o600)
	})
}
