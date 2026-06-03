package server

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

func listPluginManifests() ([]pluginManifest, error) {
	root := pluginRoot()
	entries, err := os.ReadDir(root)
	if errors.Is(err, fs.ErrNotExist) {
		return []pluginManifest{}, nil
	}
	if err != nil {
		return nil, err
	}
	plugins := make([]pluginManifest, 0, len(entries))
	for _, entry := range entries {
		if entry.Name() == ".metadata" {
			continue
		}
		if !entry.IsDir() && entry.Type()&fs.ModeSymlink == 0 {
			continue
		}
		plugin, err := readPluginManifest(filepath.Join(root, entry.Name()))
		if err == nil {
			plugins = append(plugins, plugin)
		}
	}
	sort.Slice(plugins, func(i, j int) bool { return plugins[i].ID < plugins[j].ID })
	return plugins, nil
}

func readPluginManifest(dir string) (pluginManifest, error) {
	data, err := os.ReadFile(filepath.Join(dir, "plugin.json"))
	if err != nil {
		return pluginManifest{}, err
	}
	var plugin pluginManifest
	if err := json.Unmarshal(data, &plugin); err != nil {
		return pluginManifest{}, err
	}
	plugin.ID = cleanPluginID(plugin.ID)
	if plugin.ID == "" || plugin.Entry == "" {
		return pluginManifest{}, errors.New("plugin.json requires id and entry")
	}
	if strings.TrimSpace(plugin.Name) == "" {
		plugin.Name = plugin.ID
	}
	if strings.TrimSpace(plugin.Version) == "" {
		plugin.Version = "dev"
	}
	entryPath := filepath.Clean(plugin.Entry)
	if strings.HasPrefix(entryPath, "..") || filepath.IsAbs(entryPath) {
		return pluginManifest{}, errors.New("plugin entry must stay inside plugin directory")
	}
	if _, err := os.Stat(filepath.Join(dir, entryPath)); err != nil {
		return pluginManifest{}, err
	}
	plugin.Entry = filepath.ToSlash(entryPath)
	if strings.TrimSpace(plugin.Backend) != "" {
		backendPath := filepath.Clean(plugin.Backend)
		if strings.HasPrefix(backendPath, "..") || filepath.IsAbs(backendPath) {
			return pluginManifest{}, errors.New("plugin backend must stay inside plugin directory")
		}
		if _, err := os.Stat(filepath.Join(dir, backendPath)); err != nil {
			return pluginManifest{}, err
		}
		plugin.Backend = filepath.ToSlash(backendPath)
	}
	plugin.Path = dir
	metadata := readPluginMetadata(dir, plugin.ID)
	plugin.Source = metadata.Source
	plugin.URL = metadata.URL
	if metadata.Enabled != nil {
		plugin.Enabled = *metadata.Enabled
	} else {
		_, disabledErr := os.Stat(filepath.Join(dir, ".disabled"))
		plugin.Enabled = errors.Is(disabledErr, fs.ErrNotExist)
	}
	entryInfo, err := os.Stat(filepath.Join(dir, entryPath))
	if err == nil {
		plugin.CacheKey = entryInfo.ModTime().Format("20060102150405.000000000")
	}
	return plugin, nil
}

func readPluginMetadata(dir string, id string) pluginInstallMetadata {
	if id != "" {
		data, err := os.ReadFile(pluginMetadataPath(id))
		if err == nil {
			var metadata pluginInstallMetadata
			if err := json.Unmarshal(data, &metadata); err == nil {
				return metadata
			}
		}
	}
	data, err := os.ReadFile(filepath.Join(dir, ".pi-web-plugin.json"))
	if err == nil {
		var metadata pluginInstallMetadata
		if err := json.Unmarshal(data, &metadata); err == nil {
			return metadata
		}
	}
	if info, err := os.Lstat(dir); err == nil && info.Mode()&fs.ModeSymlink != 0 {
		return pluginInstallMetadata{}
	}
	gitDir := filepath.Join(dir, ".git")
	if _, err := os.Stat(gitDir); err != nil {
		return pluginInstallMetadata{}
	}
	cmd := exec.Command("git", "-C", dir, "remote", "get-url", "origin")
	output, err := cmd.Output()
	if err != nil {
		return pluginInstallMetadata{}
	}
	url := strings.TrimSpace(string(output))
	if url == "" {
		return pluginInstallMetadata{}
	}
	return pluginInstallMetadata{Source: "github", URL: url}
}

func writePluginMetadata(id string, metadata pluginInstallMetadata) error {
	if err := os.MkdirAll(pluginMetadataDir(), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(pluginMetadataPath(id), data, 0o600)
}

func setPluginEnabled(id string, enabled bool) error {
	id = cleanPluginID(id)
	if id == "" {
		return errors.New("invalid plugin id")
	}
	plugin, err := readPluginManifest(filepath.Join(pluginRoot(), id))
	if err != nil {
		return err
	}
	metadata := readPluginMetadata(plugin.Path, id)
	metadata.Source = plugin.Source
	metadata.URL = plugin.URL
	metadata.Enabled = &enabled
	return writePluginMetadata(id, metadata)
}
