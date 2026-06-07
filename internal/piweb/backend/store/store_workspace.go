package store

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
