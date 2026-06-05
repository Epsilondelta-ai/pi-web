package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var defaultPluginURLs = []string{
	"https://github.com/Epsilondelta-ai/pi-web-toast-noti",
	"https://github.com/Epsilondelta-ai/pi-web-file-browser",
	"https://github.com/Epsilondelta-ai/pi-web-git-viewer",
	"https://github.com/Epsilondelta-ai/pi-web-sidebar",
	"https://github.com/Epsilondelta-ai/pi-web-chat",
	"https://github.com/Epsilondelta-ai/pi-web-discord-noti",
	"https://github.com/Epsilondelta-ai/pi-web-telegram-noti",
}

type defaultPluginInstallOptions struct {
	Mode       string
	PluginRoot string
	URLs       []string
}

func defaultPluginInstallOptionsFromEnv() defaultPluginInstallOptions {
	mode := strings.TrimSpace(os.Getenv("PI_WEB_INSTALL_DEFAULT_PLUGINS"))
	if mode == "" {
		mode = "auto"
	}
	urls := defaultPluginURLs
	if rawURLs := strings.TrimSpace(os.Getenv("PI_WEB_DEFAULT_PLUGIN_URLS")); rawURLs != "" {
		urls = strings.Fields(rawURLs)
	}
	return defaultPluginInstallOptions{Mode: mode, PluginRoot: defaultPluginRoot(), URLs: urls}
}

func defaultPluginRoot() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(".", ".pi-web", "plugins")
	}
	return filepath.Join(home, ".pi-web", "plugins")
}

func installDefaultPluginsIfNeeded(out io.Writer, options defaultPluginInstallOptions) error {
	mode := strings.TrimSpace(options.Mode)
	if mode == "" {
		mode = "auto"
	}
	if mode != "auto" && mode != "always" && mode != "never" {
		return errors.New("PI_WEB_INSTALL_DEFAULT_PLUGINS must be auto, always, or never")
	}
	if mode == "never" {
		return nil
	}
	if options.PluginRoot == "" {
		options.PluginRoot = defaultPluginRoot()
	}
	if mode == "auto" && hasInstalledPlugins(options.PluginRoot) {
		fmt.Fprintln(out, "Default plugins already present; skipping")
		return nil
	}
	if _, err := exec.LookPath("git"); err != nil {
		if mode == "always" {
			return errors.New("git is required to install default plugins")
		}
		fmt.Fprintln(out, "Skipping default plugins: git not found")
		return nil
	}
	if len(options.URLs) == 0 {
		options.URLs = defaultPluginURLs
	}
	return installDefaultPlugins(out, options)
}

func hasInstalledPlugins(root string) bool {
	entries, err := os.ReadDir(root)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == ".metadata" {
			continue
		}
		if _, err := os.Stat(filepath.Join(root, entry.Name(), "plugin.json")); err == nil {
			return true
		}
	}
	return false
}

func installDefaultPlugins(out io.Writer, options defaultPluginInstallOptions) error {
	metadataRoot := filepath.Join(options.PluginRoot, ".metadata")
	if err := os.MkdirAll(metadataRoot, 0o700); err != nil {
		return err
	}
	for _, pluginURL := range options.URLs {
		if err := installDefaultPlugin(pluginURL, options.PluginRoot, metadataRoot); err != nil {
			if options.Mode == "always" {
				return err
			}
			fmt.Fprintf(out, "Warning: %v\n", err)
			continue
		}
		fmt.Fprintf(out, "Installed default plugin: %s\n", pluginURL)
	}
	return nil
}

func installDefaultPlugin(pluginURL string, pluginRoot string, metadataRoot string) error {
	tempDir, err := os.MkdirTemp("", "pi-web-default-plugin-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)
	if output, err := exec.Command("git", "clone", "--depth", "1", pluginURL, tempDir).CombinedOutput(); err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("failed to clone default plugin %s: %s", pluginURL, message)
	}
	manifestPath := filepath.Join(tempDir, "plugin.json")
	manifest, err := readDefaultPluginManifest(manifestPath)
	if err != nil {
		return fmt.Errorf("default plugin %s: %w", pluginURL, err)
	}
	target := filepath.Join(pluginRoot, manifest.ID)
	if err := os.RemoveAll(target); err != nil {
		return err
	}
	if err := copyDefaultPluginDir(tempDir, target); err != nil {
		return err
	}
	return writeDefaultPluginMetadata(filepath.Join(metadataRoot, manifest.ID+".json"), pluginURL)
}

type defaultPluginManifest struct {
	ID string `json:"id"`
}

func readDefaultPluginManifest(path string) (defaultPluginManifest, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return defaultPluginManifest{}, errors.New("missing plugin.json")
	}
	var manifest defaultPluginManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return defaultPluginManifest{}, err
	}
	if cleanDefaultPluginID(manifest.ID) == "" {
		return defaultPluginManifest{}, errors.New("invalid plugin id")
	}
	return manifest, nil
}

func cleanDefaultPluginID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" || strings.Contains(id, "/") || strings.Contains(id, "\\") || strings.Contains(id, "..") {
		return ""
	}
	return id
}

func copyDefaultPluginDir(source string, target string) error {
	if err := os.MkdirAll(target, 0o700); err != nil {
		return err
	}
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, err error) error {
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

func writeDefaultPluginMetadata(path string, pluginURL string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	content, err := json.MarshalIndent(map[string]string{"source": "github", "url": pluginURL}, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	return os.WriteFile(path, content, 0o600)
}
