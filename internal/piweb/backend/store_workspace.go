package backend

import backendfiles "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/files"

func (s *Store) Workspaces() []Workspace {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.refreshAllWorkspaceSessionsLocked()
	return cloneWorkspaces(s.workspaces)
}
func (s *Store) OpenWorkspace(path string) (Workspace, error) {
	clean, err := ValidateWorkspacePath(path)
	if err != nil {
		return Workspace{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	workspace := s.addWorkspaceLocked(clean)
	s.saveWorkspaceRecentsLocked()
	return workspace, nil
}
func (s *Store) DeleteWorkspace(workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, workspace := range s.workspaces {
		if workspace.ID == workspaceID {
			s.workspaces = append(s.workspaces[:i], s.workspaces[i+1:]...)
			delete(s.workspacePath, workspaceID)
			delete(s.workspaceSessionDir, workspaceID)
			delete(s.files, workspaceID)
			s.saveWorkspaceRecentsLocked()
			return nil
		}
	}
	return ErrNotFound
}
func (s *Store) WorkspacePath(workspaceID string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	root := s.workspacePath[workspaceID]
	if root == "" {
		return "", ErrNotFound
	}
	return root, nil
}
func (s *Store) Files(workspaceID string) ([]FileNode, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	mock := append([]FileNode(nil), s.files[workspaceID]...)
	_, exists := s.files[workspaceID]
	s.mu.RUnlock()
	if root != "" {
		if files, err := backendfiles.RealFileTree(root, 3); err == nil {
			return files, nil
		}
	}
	if !exists {
		return nil, ErrNotFound
	}
	return mock, nil
}
func (s *Store) SearchFiles(workspaceID, query string) ([]string, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	s.mu.RUnlock()
	if root == "" {
		return nil, ErrNotFound
	}
	return backendfiles.SearchWorkspaceFiles(root, query)
}

func (s *Store) ReadFile(workspaceID, rel string) (FileContent, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	s.mu.RUnlock()
	if root == "" {
		return FileContent{}, ErrNotFound
	}
	return backendfiles.ReadWorkspaceFile(root, rel, 256*1024)
}
func (s *Store) WriteFile(workspaceID, rel, content string) (FileContent, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	s.mu.RUnlock()
	if root == "" {
		return FileContent{}, ErrNotFound
	}
	return backendfiles.WriteWorkspaceFile(root, rel, content)
}
func (s *Store) CreateFile(workspaceID, rel, kind, content string) (FileContent, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	s.mu.RUnlock()
	if root == "" {
		return FileContent{}, ErrNotFound
	}
	return backendfiles.CreateWorkspacePath(root, rel, kind, content)
}
func (s *Store) RenameFile(workspaceID, oldRel, newRel string) error {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	s.mu.RUnlock()
	if root == "" {
		return ErrNotFound
	}
	return backendfiles.RenameWorkspacePath(root, oldRel, newRel)
}
func (s *Store) DeleteFile(workspaceID, rel string) error {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	s.mu.RUnlock()
	if root == "" {
		return ErrNotFound
	}
	return backendfiles.DeleteWorkspacePath(root, rel)
}
func (s *Store) UploadFile(workspaceID, rel string, data []byte, overwrite bool) (FileContent, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	s.mu.RUnlock()
	if root == "" {
		return FileContent{}, ErrNotFound
	}
	return backendfiles.UploadWorkspaceFile(root, rel, data, overwrite)
}
func (s *Store) GitStatus(workspaceID string) (GitStatus, error) {
	s.mu.RLock()
	root := s.workspacePath[workspaceID]
	found := false
	for _, workspace := range s.workspaces {
		if workspace.ID == workspaceID {
			found = true
			break
		}
	}
	s.mu.RUnlock()
	if !found {
		return GitStatus{}, ErrNotFound
	}
	if root != "" {
		if status, err := backendfiles.RealGitStatus(root); err == nil {
			return status, nil
		}
	}
	return GitStatus{Branch: "main", Dirty: 3, Files: map[string]string{}}, nil
}
