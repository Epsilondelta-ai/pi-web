package server

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type pluginManifest struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version"`
	Entry   string `json:"entry"`
	Enabled bool   `json:"enabled"`
	Path    string `json:"path"`
}

type pluginInstallRequest struct {
	Path string `json:"path"`
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
	plugin, err := installLocalPlugin(body.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugin": plugin})
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
	return plugin, nil
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
