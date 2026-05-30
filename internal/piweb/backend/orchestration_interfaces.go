package backend

import (
	"context"
	"net/http"

	backendrunner "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/runner"
)

// EventSink is the event publication boundary consumed by long-running process orchestration.
type EventSink = backendrunner.EventSink

// SessionMessageStore is the narrow session persistence boundary consumed by Runner.
type SessionMessageStore = backendrunner.SessionMessageStore

// ServerStore is the persistence boundary consumed by HTTP handlers.
type ServerStore interface {
	SessionMessageStore
	WorkspaceOpStore
	AppendMessage(sessionID string, msg Message) error
	AutoNameSession(sessionID, prompt string) (Session, bool, error)
	CreateFile(workspaceID, rel, kind, content string) (FileContent, error)
	CreateSession(workspaceID string) (Session, error)
	DeleteFile(workspaceID, rel string) error
	DeleteSession(sessionID string) error
	DeleteWorkspace(workspaceID string) error
	DeleteWorkspaceSessions(workspaceID string) (int, error)
	Files(workspaceID string) ([]FileNode, error)
	GitStatus(workspaceID string) (GitStatus, error)
	OpenWorkspace(path string) (Workspace, error)
	ReadFile(workspaceID, rel string) (FileContent, error)
	RenameFile(workspaceID, oldRel, newRel string) error
	RenameSession(sessionID, title string) (Session, error)
	SearchFiles(workspaceID, query string) ([]string, error)
	Session(sessionID string) (Session, []Message, error)
	SessionPage(sessionID string, limit int, before string) (Session, SessionMessagePage, error)
	Sessions(workspaceID string) ([]Session, error)
	UploadFile(workspaceID, rel string, data []byte, overwrite bool) (FileContent, error)
	WorkspacePath(workspaceID string) (string, error)
	Workspaces() []Workspace
	WriteFile(workspaceID, rel, content string) (FileContent, error)
}

// ServerBroker is the event boundary consumed by HTTP handlers.
type ServerBroker interface {
	EventSink
	PublishMockPrompt(ctx context.Context, store SessionMessageStore, sessionID, text string)
	ServeSession(w http.ResponseWriter, r *http.Request, sessionID string)
	Subscribe(sessionID string) (<-chan Event, func())
}

// ServerRunner is the process boundary consumed by HTTP handlers.
type ServerRunner interface {
	Cancel(sessionID string) bool
	IsRunning(sessionID string) bool
	RunningSessionIDs() map[string]bool
	StartPiPrompt(parent context.Context, events EventSink, store SessionMessageStore, sessionID string, text string, images []PromptAttachment, displayText string) error
	Steer(sessionID string, text string, images []PromptAttachment) error
}
