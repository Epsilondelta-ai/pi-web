package server

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type pluginManifest struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Version  string `json:"version"`
	Entry    string `json:"entry"`
	Enabled  bool   `json:"enabled"`
	Path     string `json:"path"`
	Source   string `json:"source"`
	URL      string `json:"url"`
	CacheKey string `json:"cacheKey"`
}

type pluginInstallMetadata struct {
	Source string `json:"source"`
	URL    string `json:"url"`
	Path   string `json:"path"`
}

type pluginInstallRequest struct {
	Source string `json:"source"`
	Path   string `json:"path"`
	URL    string `json:"url"`
}

func (s *Server) plugins(w http.ResponseWriter, r *http.Request) {
	plugins, err := listPluginManifests()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": plugins})
}

func (s *Server) installPlugin(w http.ResponseWriter, r *http.Request) {
	var body pluginInstallRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	plugin, err := installPluginRequest(body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugin": plugin})
}

func (s *Server) reloadPlugins(w http.ResponseWriter, _ *http.Request) {
	plugins, err := reloadGitHubPlugins()
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": plugins})
}

func (s *Server) enablePlugin(w http.ResponseWriter, r *http.Request) {
	if err := setPluginEnabled(r.PathValue("pluginID"), true); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) disablePlugin(w http.ResponseWriter, r *http.Request) {
	if err := setPluginEnabled(r.PathValue("pluginID"), false); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) uninstallPlugin(w http.ResponseWriter, r *http.Request) {
	id := cleanPluginID(r.PathValue("pluginID"))
	if id == "" {
		writeError(w, http.StatusBadRequest, errors.New("invalid plugin id"))
		return
	}
	if err := os.RemoveAll(filepath.Join(pluginRoot(), id)); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) pluginAsset(w http.ResponseWriter, r *http.Request) {
	id := cleanPluginID(r.PathValue("pluginID"))
	assetPath := filepath.Clean(r.PathValue("path"))
	if id == "" || strings.HasPrefix(assetPath, "..") || filepath.IsAbs(assetPath) {
		writeError(w, http.StatusBadRequest, errors.New("invalid plugin asset"))
		return
	}
	http.ServeFile(w, r, filepath.Join(pluginRoot(), id, assetPath))
}

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
	if err := writePluginMetadata(target, pluginInstallMetadata{Source: "github", URL: cloneURL}); err != nil {
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
	return readPluginManifest(target)
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
	_, disabledErr := os.Stat(filepath.Join(dir, ".disabled"))
	plugin.Enabled = errors.Is(disabledErr, fs.ErrNotExist)
	plugin.Path = dir
	metadata := readPluginMetadata(dir)
	plugin.Source = metadata.Source
	plugin.URL = metadata.URL
	entryInfo, err := os.Stat(filepath.Join(dir, entryPath))
	if err == nil {
		plugin.CacheKey = entryInfo.ModTime().Format("20060102150405.000000000")
	}
	return plugin, nil
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

func readPluginMetadata(dir string) pluginInstallMetadata {
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

func writePluginMetadata(dir string, metadata pluginInstallMetadata) error {
	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, ".pi-web-plugin.json"), data, 0o600)
}

func setPluginEnabled(id string, enabled bool) error {
	id = cleanPluginID(id)
	if id == "" {
		return errors.New("invalid plugin id")
	}
	disabledPath := filepath.Join(pluginRoot(), id, ".disabled")
	if enabled {
		err := os.Remove(disabledPath)
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	return os.WriteFile(disabledPath, []byte("disabled\n"), 0o600)
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

func cleanPluginID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" || strings.Contains(id, "/") || strings.Contains(id, "\\") || strings.Contains(id, "..") {
		return ""
	}
	return id
}

func pluginRoot() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(".", ".pi-web", "plugins")
	}
	return filepath.Join(home, ".pi-web", "plugins")
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
