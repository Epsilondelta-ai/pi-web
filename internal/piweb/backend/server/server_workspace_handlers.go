package server

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	backendfiles "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/files"
	backendgit "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/git"
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
func (s *Server) listFolders(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "~"
	}
	folders, err := backendfiles.ListFolders(path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, folders)
}
func (s *Server) workspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": s.withLiveSessions(s.store.Workspaces())})
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
func (s *Server) cloneWorkspace(w http.ResponseWriter, r *http.Request) {
	var req CloneWorkspaceRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	workspace, output, err := CloneGitWorkspace(s.context(), s.store, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, errors.New(strings.TrimSpace(err.Error()+"\n"+output)))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"workspace": workspace, "output": output})
}
func (s *Server) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteWorkspace(r.PathValue("workspaceID")); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	session, err := s.store.CreateSession(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"session": session})
}
func (s *Server) workspaceSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := s.store.Sessions(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": s.withLiveSessionFlags(sessions)})
}
func (s *Server) withLiveSessions(workspaces []Workspace) []Workspace {
	for workspaceIndex := range workspaces {
		workspaces[workspaceIndex].Sessions = s.withLiveSessionFlags(workspaces[workspaceIndex].Sessions)
		for _, session := range workspaces[workspaceIndex].Sessions {
			workspaces[workspaceIndex].Live = workspaces[workspaceIndex].Live || session.Live
		}
	}
	return workspaces
}

func (s *Server) withLiveSessionFlags(sessions []Session) []Session {
	running := s.runningSessionIDs()
	for index := range sessions {
		if !running[sessions[index].ID] {
			continue
		}
		sessions[index].Live = true
		sessions[index].Active = true
		sessions[index].LastUsed = "live"
	}
	return sessions
}

func (s *Server) runningSessionIDs() map[string]bool {
	return s.runner.RunningSessionIDs()
}

func (s *Server) workspaceFiles(w http.ResponseWriter, r *http.Request) {
	files, err := s.store.Files(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": files})
}
func (s *Server) searchWorkspaceFiles(w http.ResponseWriter, r *http.Request) {
	matches, err := s.store.SearchFiles(r.PathValue("workspaceID"), r.URL.Query().Get("q"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"matches": matches})
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
func (s *Server) readWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	file, err := s.store.ReadFile(r.PathValue("workspaceID"), r.URL.Query().Get("path"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, file)
}
func (s *Server) writeWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	var req WriteFileRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	file, err := s.store.WriteFile(r.PathValue("workspaceID"), r.URL.Query().Get("path"), req.Content)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, file)
}
func (s *Server) createWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	var req CreateFileRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	file, err := s.store.CreateFile(r.PathValue("workspaceID"), req.Path, req.Kind, req.Content)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, file)
}
func (s *Server) renameWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	var req RenameFileRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.store.RenameFile(r.PathValue("workspaceID"), req.OldPath, req.NewPath); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"renamed": true, "path": req.NewPath})
}
func (s *Server) deleteWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	var req DeleteFileRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.store.DeleteFile(r.PathValue("workspaceID"), req.Path); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
func (s *Server) uploadWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	var req UploadFileRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	content := req.Content
	if index := strings.Index(content, ","); strings.HasPrefix(content, "data:") && index >= 0 {
		content = content[index+1:]
	}
	data, err := base64.StdEncoding.DecodeString(content)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	file, err := s.store.UploadFile(r.PathValue("workspaceID"), req.Path, data, req.Overwrite)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, file)
}
func (s *Server) gitStatus(w http.ResponseWriter, r *http.Request) {
	status, err := s.store.GitStatus(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}
func (s *Server) gitHistory(w http.ResponseWriter, r *http.Request) {
	root, err := s.store.WorkspacePath(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	commits, err := backendgit.RealGitHistory(r.Context(), root, limit)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"commits": commits})
}

func (s *Server) gitCommit(w http.ResponseWriter, r *http.Request) {
	root, err := s.store.WorkspacePath(r.PathValue("workspaceID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	detail, err := backendgit.RealGitCommitDetail(r.Context(), root, r.URL.Query().Get("hash"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) shellCommand(w http.ResponseWriter, r *http.Request) {
	var req ShellCommandRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	result, err := RunWorkspaceShellCommand(s.context(), s.store, r.PathValue("workspaceID"), req.Command)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
