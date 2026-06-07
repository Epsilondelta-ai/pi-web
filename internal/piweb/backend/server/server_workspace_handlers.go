package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
}
func (s *Server) versionStatus(w http.ResponseWriter, r *http.Request) {
	status := VersionStatus{CurrentVersion: s.config.CurrentVersion}
	if s.config.VersionStatus != nil {
		resolved, err := s.config.VersionStatus(r.Context(), s.config.CurrentVersion)
		if err != nil {
			status.Error = err.Error()
		} else {
			status = resolved
		}
	}
	if status.CurrentVersion == "" {
		status.CurrentVersion = s.config.CurrentVersion
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) piVersionStatus(w http.ResponseWriter, r *http.Request) {
	status := MockPiVersionStatus()
	if s.config.EnablePiExecution {
		if s.config.PiVersionStatus != nil {
			resolved, err := s.config.PiVersionStatus(r.Context())
			if err != nil {
				status.Error = err.Error()
			} else {
				status = resolved
			}
		} else {
			resolved, err := DetectPiVersionStatus(r.Context())
			if err != nil {
				status.Error = err.Error()
			} else {
				status = resolved
			}
		}
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) piPackageUpdateStatus(w http.ResponseWriter, r *http.Request) {
	status := PiPackageUpdateStatus{}
	if !s.config.EnablePiExecution {
		writeJSON(w, http.StatusOK, status)
		return
	}
	workspaceID := r.URL.Query().Get("workspaceId")
	if workspaceID == "" {
		// Global check
		if s.config.PiPackageUpdateStatus != nil {
			resolved, err := s.config.PiPackageUpdateStatus(r.Context())
			if err != nil {
				status.Error = err.Error()
			} else {
				status = resolved
			}
		} else {
			resolved, err := DetectGlobalPackageUpdates(r.Context())
			if err != nil {
				status.Error = err.Error()
			} else {
				status = resolved
			}
		}
	} else {
		// Workspace-specific check
		workspacePath, err := s.store.WorkspacePath(workspaceID)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		resolved, err := DetectWorkspacePackageUpdates(r.Context(), workspacePath)
		if err != nil {
			status.Error = err.Error()
		} else {
			status = resolved
			status.WorkspaceID = workspaceID
		}
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) piUpdateStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.piUpdater.Status())
}

func (s *Server) startPiUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Pi-Web-Request") != "pi-update" {
		writeError(w, http.StatusForbidden, errors.New("pi update requires an app request header"))
		return
	}
	var req struct {
		Source      string `json:"source"`
		WorkspaceID string `json:"workspaceId"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if !s.config.EnablePiExecution {
		writeJSON(w, http.StatusOK, PiUpdateStatus{State: PiUpdateUpdated})
		return
	}
	workspaceDir := ""
	if req.WorkspaceID != "" {
		dir, err := s.store.WorkspacePath(req.WorkspaceID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		workspaceDir = dir
	}
	writeJSON(w, http.StatusAccepted, s.piUpdater.Start(s.context(), strings.TrimSpace(req.Source), workspaceDir))
}
func (s *Server) openWorkspace(w http.ResponseWriter, r *http.Request) {
	var req OpenWorkspaceRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	workspace, err := s.store.OpenWorkspace(req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, workspace)
}
func (s *Server) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteWorkspace(r.PathValue("workspaceID")); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
func (s *Server) workspaceCommands(w http.ResponseWriter, r *http.Request) {
	root, err := s.store.WorkspacePath(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	result := s.workspaceCommandList(r.Context(), r.PathValue("workspaceID"), root, r.URL.Query().Get("reload") == "1")
	body := map[string]any{"commands": result.Commands}
	if len(result.Diagnostics) > 0 {
		body["diagnostics"] = result.Diagnostics
	}
	writeJSON(w, http.StatusOK, body)
}
func (s *Server) workspaceModels(w http.ResponseWriter, r *http.Request) {
	root, err := s.store.WorkspacePath(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	models := fallbackWorkspaceModels(root, nil)
	if s.config.EnablePiExecution {
		models, err = WorkspaceModels(r.Context(), root)
		if err != nil {
			models = fallbackWorkspaceModels(root, err)
		}
	}
	writeJSON(w, http.StatusOK, models)
}

func (s *Server) workspaceRuntimeStatus(w http.ResponseWriter, r *http.Request) {
	root, err := s.store.WorkspacePath(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	status := MockRuntimeStatus()
	if s.config.EnablePiExecution {
		status, err = WorkspaceRuntimeStatus(r.Context(), root)
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": status})
}
func (s *Server) workspaceSettings(w http.ResponseWriter, r *http.Request) {
	root, err := s.store.WorkspacePath(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	settings, err := WorkspaceSettings(root)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": settings})
}
func (s *Server) saveWorkspaceSettings(w http.ResponseWriter, r *http.Request) {
	root, err := s.store.WorkspacePath(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	var req SettingsPatchRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	settings, err := SaveWorkspaceSettings(root, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": settings})
}
