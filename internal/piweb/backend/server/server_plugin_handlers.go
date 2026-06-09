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

type pluginEventRequest struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
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

func (s *Server) pluginEvents(w http.ResponseWriter, r *http.Request) {
	id := cleanPluginID(r.PathValue("pluginID"))
	channel := cleanPluginID(r.PathValue("channel"))
	if id == "" || channel == "" {
		writeError(w, http.StatusBadRequest, errors.New("invalid plugin event stream"))
		return
	}

	if _, err := readPluginManifest(filepath.Join(pluginRoot(), id)); err != nil {
		writeError(w, http.StatusNotFound, errors.New("plugin not found"))
		return
	}

	s.broker.ServeSession(w, r, pluginEventChannel(id, channel))
}

func (s *Server) publishPluginEvent(w http.ResponseWriter, r *http.Request) {
	id := cleanPluginID(r.PathValue("pluginID"))
	channel := cleanPluginID(r.PathValue("channel"))
	if id == "" || channel == "" {
		writeError(w, http.StatusBadRequest, errors.New("invalid plugin event publish"))
		return
	}

	if _, err := readPluginManifest(filepath.Join(pluginRoot(), id)); err != nil {
		writeError(w, http.StatusNotFound, errors.New("plugin not found"))
		return
	}

	var body pluginEventRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	eventType := cleanPluginEventType(body.Type)
	if eventType == "" {
		writeError(w, http.StatusBadRequest, errors.New("event type is required"))
		return
	}

	var payload any = map[string]any{}
	if len(body.Payload) > 0 {
		if err := json.Unmarshal(body.Payload, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
	}

	event := s.broker.Publish(pluginEventChannel(id, channel), eventType, payload)
	writeJSON(w, http.StatusOK, map[string]any{"event": event})
}

func pluginEventChannel(pluginID string, channel string) string {
	return "plugin:" + pluginID + ":" + channel
}

func cleanPluginEventType(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || strings.ContainsAny(value, "\r\n") {
		return ""
	}
	return value
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
	if acceptsEventStream(r) {
		if err := streamPluginBackendCommand(w, cmd); err != nil {
			writeError(w, http.StatusBadRequest, err)
		}
		return
	}

	output, err := runPluginBackendCommand(cmd)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(output)
}

func acceptsEventStream(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept"), "text/event-stream")
}
