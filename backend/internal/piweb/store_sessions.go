package piweb

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"
)

func (s *Store) CreateSession(workspaceID string) (Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root := s.workspacePath[workspaceID]
	if root == "" {
		return Session{}, ErrNotFound
	}
	session, file, err := CreatePiSessionFile(root)
	if err != nil {
		return Session{}, err
	}
	session.Workspace = workspaceID
	for i := range s.workspaces {
		if s.workspaces[i].ID == workspaceID {
			for j := range s.workspaces[i].Sessions {
				s.workspaces[i].Sessions[j].Active = false
			}
			s.workspaces[i].Sessions = append([]Session{session}, s.workspaces[i].Sessions...)
			s.workspaces[i].SessionCount = len(s.workspaces[i].Sessions)
			s.workspaces[i].LastUsed = "now"
			s.conversations[session.ID] = []Message{}
			s.sessionFiles[session.ID] = file
			s.sessionCWD[session.ID] = root
			return session, nil
		}
	}
	return Session{}, ErrNotFound
}
func (s *Store) Sessions(workspaceID string) ([]Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for index, workspace := range s.workspaces {
		if workspace.ID == workspaceID {
			s.refreshWorkspaceSessionsLocked(index, false)
			return append([]Session(nil), s.workspaces[index].Sessions...), nil
		}
	}
	return nil, ErrNotFound
}

func (s *Store) Session(sessionID string) (Session, []Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.refreshAllWorkspaceSessionsLocked()
	for _, workspace := range s.workspaces {
		for _, session := range workspace.Sessions {
			if session.ID == sessionID {
				return session, append([]Message(nil), s.conversations[sessionID]...), nil
			}
		}
	}
	return Session{}, nil, ErrNotFound
}
func (s *Store) AutoNameSession(sessionID, prompt string) (Session, bool, error) {
	title := trimTitle(prompt)
	if title == "" {
		return Session{}, false, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for workspaceIndex := range s.workspaces {
		for sessionIndex := range s.workspaces[workspaceIndex].Sessions {
			if s.workspaces[workspaceIndex].Sessions[sessionIndex].ID == sessionID {
				current := strings.TrimSpace(s.workspaces[workspaceIndex].Sessions[sessionIndex].Title)
				if current != "" && current != "new session" {
					return s.workspaces[workspaceIndex].Sessions[sessionIndex], false, nil
				}
				s.workspaces[workspaceIndex].Sessions[sessionIndex].Title = title
				if err := appendSessionInfo(s.sessionFiles[sessionID], title); err != nil {
					return Session{}, false, err
				}
				return s.workspaces[workspaceIndex].Sessions[sessionIndex], true, nil
			}
		}
	}
	return Session{}, false, ErrNotFound
}
func (s *Store) RenameSession(sessionID, title string) (Session, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return Session{}, errors.New("title is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for workspaceIndex := range s.workspaces {
		for sessionIndex := range s.workspaces[workspaceIndex].Sessions {
			if s.workspaces[workspaceIndex].Sessions[sessionIndex].ID == sessionID {
				s.workspaces[workspaceIndex].Sessions[sessionIndex].Title = title
				if err := appendSessionInfo(s.sessionFiles[sessionID], title); err != nil {
					return Session{}, err
				}
				return s.workspaces[workspaceIndex].Sessions[sessionIndex], nil
			}
		}
	}
	return Session{}, ErrNotFound
}
func (s *Store) DeleteSession(sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.refreshAllWorkspaceSessionsLocked()
	for workspaceIndex := range s.workspaces {
		for sessionIndex := range s.workspaces[workspaceIndex].Sessions {
			if s.workspaces[workspaceIndex].Sessions[sessionIndex].ID == sessionID {
				sessions := s.workspaces[workspaceIndex].Sessions
				s.workspaces[workspaceIndex].Sessions = append(sessions[:sessionIndex], sessions[sessionIndex+1:]...)
				s.workspaces[workspaceIndex].SessionCount = len(s.workspaces[workspaceIndex].Sessions)
				if file := s.sessionFiles[sessionID]; file != "" {
					_ = os.Remove(file)
				}
				delete(s.conversations, sessionID)
				delete(s.sessionFiles, sessionID)
				delete(s.sessionCWD, sessionID)
				return nil
			}
		}
	}
	return ErrNotFound
}

func (s *Store) DeleteWorkspaceSessions(workspaceID string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for workspaceIndex := range s.workspaces {
		if s.workspaces[workspaceIndex].ID != workspaceID {
			continue
		}
		root := s.workspacePath[workspaceID]
		if root == "" {
			return 0, ErrNotFound
		}
		s.refreshWorkspaceSessionsLocked(workspaceIndex, true)
		deletedIDs := map[string]struct{}{}
		for _, session := range s.workspaces[workspaceIndex].Sessions {
			deletedIDs[session.ID] = struct{}{}
		}
		if err := os.RemoveAll(piSessionDirForCWD(root)); err != nil {
			return 0, err
		}
		for sessionID := range deletedIDs {
			delete(s.conversations, sessionID)
			delete(s.sessionFiles, sessionID)
			delete(s.sessionCWD, sessionID)
		}
		delete(s.sessionDirModTime, workspaceID)
		s.workspaces[workspaceIndex].Sessions = []Session{}
		s.workspaces[workspaceIndex].SessionCount = 0
		return len(deletedIDs), nil
	}
	return 0, ErrNotFound
}

func (s *Store) refreshAllWorkspaceSessionsLocked() {
	for index := range s.workspaces {
		s.refreshWorkspaceSessionsLocked(index, false)
	}
}

func (s *Store) refreshWorkspaceSessionsLocked(workspaceIndex int, force bool) {
	if workspaceIndex < 0 || workspaceIndex >= len(s.workspaces) {
		return
	}
	workspaceID := s.workspaces[workspaceIndex].ID
	if s.refreshDisabledWorkspace[workspaceID] {
		return
	}
	root := s.workspacePath[workspaceID]
	if root == "" {
		return
	}
	sessionDir := s.workspaceSessionDir[workspaceID]
	if sessionDir == "" {
		sessionDir = piSessionDirForCWD(root)
	}
	sourcesModTime := sessionSourcesModTime(sessionDir, DefaultPiTeamsDir())
	if sourcesModTime.IsZero() {
		return
	}
	if s.sessionDirModTime == nil {
		s.sessionDirModTime = map[string]time.Time{}
	}
	if !force && s.sessionDirModTime[workspaceID].Equal(sourcesModTime) {
		return
	}
	parsed, err := LoadPiSessions(sessionDir)
	if err != nil {
		return
	}
	parsed = withTeamChildSessions(parsed)
	s.sessionDirModTime[workspaceID] = sourcesModTime
	oldConversations := map[string][]Message{}
	oldFiles := map[string]string{}
	for _, session := range s.workspaces[workspaceIndex].Sessions {
		oldConversations[session.ID] = s.conversations[session.ID]
		oldFiles[session.ID] = s.sessionFiles[session.ID]
		delete(s.conversations, session.ID)
		delete(s.sessionFiles, session.ID)
		delete(s.sessionCWD, session.ID)
	}
	s.workspaces[workspaceIndex].Sessions = []Session{}
	var latestMod time.Time
	for _, item := range parsed {
		session := item.Session
		session.ID = item.Header.ID
		session.Workspace = workspaceID
		s.workspaces[workspaceIndex].Sessions = append(s.workspaces[workspaceIndex].Sessions, session)
		s.conversations[item.Header.ID] = refreshedMessages(item, oldConversations, oldFiles)
		s.sessionFiles[item.Header.ID] = item.File
		s.sessionCWD[item.Header.ID] = item.Header.CWD
		if item.ModTime.After(latestMod) {
			latestMod = item.ModTime
			s.workspaces[workspaceIndex].LastUsed = item.Session.LastUsed
		}
	}
	s.workspaces[workspaceIndex].SessionCount = len(s.workspaces[workspaceIndex].Sessions)
}

func refreshedMessages(item ParsedSession, oldConversations map[string][]Message, oldFiles map[string]string) []Message {
	oldMessages := oldConversations[item.Header.ID]
	if oldFiles[item.Header.ID] == item.File && len(oldMessages) > len(item.Messages) {
		return oldMessages
	}
	return item.Messages
}

func appendSessionInfo(path, title string) error {
	if path == "" {
		return nil
	}
	entry := map[string]any{
		"type":      "session_info",
		"id":        createSessionID(),
		"parentId":  nil,
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"name":      title,
	}
	line, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(append(line, '\n'))
	return err
}
func (s *Store) AppendMessage(sessionID string, msg Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.conversations[sessionID]; !ok {
		return ErrNotFound
	}
	s.conversations[sessionID] = append(s.conversations[sessionID], msg)
	return nil
}
func (s *Store) SessionRuntime(sessionID string) (sessionFile, cwd string, ok bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sessionFile = s.sessionFiles[sessionID]
	cwd = s.sessionCWD[sessionID]
	return sessionFile, cwd, sessionFile != "" && cwd != ""
}
