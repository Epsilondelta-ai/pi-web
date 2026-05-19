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
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, workspace := range s.workspaces {
		if workspace.ID == workspaceID {
			return append([]Session(nil), workspace.Sessions...), nil
		}
	}
	return nil, ErrNotFound
}

func (s *Store) Session(sessionID string) (Session, []Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
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
	for wi := range s.workspaces {
		for si := range s.workspaces[wi].Sessions {
			if s.workspaces[wi].Sessions[si].ID == sessionID {
				current := strings.TrimSpace(s.workspaces[wi].Sessions[si].Title)
				if current != "" && current != "new session" {
					return s.workspaces[wi].Sessions[si], false, nil
				}
				s.workspaces[wi].Sessions[si].Title = title
				if err := appendSessionInfo(s.sessionFiles[sessionID], title); err != nil {
					return Session{}, false, err
				}
				return s.workspaces[wi].Sessions[si], true, nil
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
	for wi := range s.workspaces {
		for si := range s.workspaces[wi].Sessions {
			if s.workspaces[wi].Sessions[si].ID == sessionID {
				s.workspaces[wi].Sessions[si].Title = title
				if err := appendSessionInfo(s.sessionFiles[sessionID], title); err != nil {
					return Session{}, err
				}
				return s.workspaces[wi].Sessions[si], nil
			}
		}
	}
	return Session{}, ErrNotFound
}
func (s *Store) DeleteSession(sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for wi := range s.workspaces {
		for si := range s.workspaces[wi].Sessions {
			if s.workspaces[wi].Sessions[si].ID == sessionID {
				s.workspaces[wi].Sessions = append(s.workspaces[wi].Sessions[:si], s.workspaces[wi].Sessions[si+1:]...)
				s.workspaces[wi].SessionCount = len(s.workspaces[wi].Sessions)
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
func appendSessionInfo(path, title string) error {
	if path == "" {
		return nil
	}
	entry := map[string]any{"type": "session_info", "id": createSessionID(), "parentId": nil, "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "name": title}
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
