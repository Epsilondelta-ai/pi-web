package storeapi

import "github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"

type SessionStore interface {
	SessionRuntime(sessionID string) (file string, cwd string, ok bool)
	AppendMessage(sessionID string, message shared.Message) error
	Session(sessionID string) (shared.Session, []shared.Message, error)
}

type WorkspaceStore interface {
	OpenWorkspace(path string) (shared.Workspace, error)
	WorkspacePath(workspaceID string) (string, error)
}

type Store interface {
	SessionStore
	WorkspaceStore
	Workspaces() []shared.Workspace
	CreateSession(workspaceID string) (shared.Session, error)
	Sessions(workspaceID string) ([]shared.Session, error)
}
