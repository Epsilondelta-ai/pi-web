package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

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

func (s *Server) pluginUpdates(w http.ResponseWriter, _ *http.Request) {
	updates, err := detectPluginUpdates()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": updates})
}

func (s *Server) reloadPlugins(w http.ResponseWriter, _ *http.Request) {
	plugins, err := reloadGitHubPlugins()
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": plugins})
}

func (s *Server) updatePlugin(w http.ResponseWriter, r *http.Request) {
	plugin, err := updateGitHubPlugin(r.PathValue("pluginID"))
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
	if err := os.Remove(pluginMetadataPath(id)); err != nil && !errors.Is(err, os.ErrNotExist) {
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

func (s *Server) pluginBackend(w http.ResponseWriter, r *http.Request) {
	id := cleanPluginID(r.PathValue("pluginID"))
	method := cleanPluginID(r.PathValue("method"))
	if id == "" || method == "" {
		writeError(w, http.StatusBadRequest, errors.New("invalid plugin backend request"))
		return
	}
	plugin, err := readPluginManifest(filepath.Join(pluginRoot(), id))
	if err != nil || plugin.Backend == "" {
		writeError(w, http.StatusNotFound, errors.New("plugin backend not found"))
		return
	}
	var body pluginBackendRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	workspaceRoot := ""
	if body.WorkspaceID != "" {
		root, err := s.store.WorkspacePath(body.WorkspaceID)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		workspaceRoot = root
	}
	payload := body.Data
	if len(payload) == 0 {
		payload = []byte("{}")
	}
	cmd, err := pluginBackendCommand(r.Context(), id, plugin, method, workspaceRoot)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	cmd.Stdin = bytes.NewReader(payload)
	output, err := runPluginBackendCommand(cmd)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(output)
}
