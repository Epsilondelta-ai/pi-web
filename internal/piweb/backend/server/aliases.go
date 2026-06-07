package server

import (
	"context"
	"net/http"

	backendauth "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/auth"
	backendfiles "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/files"
	backendgit "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/git"
	backendrunner "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/runner"
	backendruntime "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/runtime"
	backendsessions "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/sessions"
	backendstore "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/store"
	backendworkspace "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/workspace"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
)

type Store = backendstore.Store
type Runner = backendrunner.Runner
type WorkspaceOpStore = backendworkspace.WorkspaceOpStore
type EventSink = backendrunner.EventSink
type SessionMessageStore = backendrunner.SessionMessageStore

type Workspace = shared.Workspace
type Session = shared.Session
type Message = shared.Message
type Event = shared.Event
type FileNode = shared.FileNode
type FileContent = shared.FileContent
type GitStatus = shared.GitStatus
type PromptAttachment = shared.PromptAttachment
type PromptRequest = shared.PromptRequest
type RenameSessionRequest = shared.RenameSessionRequest
type ErrorResponse = shared.ErrorResponse
type OpenWorkspaceRequest = shared.OpenWorkspaceRequest
type CloneWorkspaceRequest = shared.CloneWorkspaceRequest
type ShellCommandRequest = shared.ShellCommandRequest
type ShellCommandResult = shared.ShellCommandResult
type CreateFileRequest = shared.CreateFileRequest
type RenameFileRequest = shared.RenameFileRequest
type DeleteFileRequest = shared.DeleteFileRequest
type WriteFileRequest = shared.WriteFileRequest
type UploadFileRequest = shared.UploadFileRequest
type FolderEntry = shared.FolderEntry
type FolderListing = shared.FolderListing
type VersionStatus = shared.VersionStatus
type PiVersionStatus = shared.PiVersionStatus
type PiUpdateStatus = shared.PiUpdateStatus
type SessionMessagePage = backendsessions.SessionMessagePage

type PiPackageUpdateDetector = backendruntime.PiPackageUpdateDetector
type PiPackageUpdateStatus = backendruntime.PiPackageUpdateStatus
type PiPackageUpdate = backendruntime.PiPackageUpdate
type PiUpdateRunner = backendruntime.PiUpdateRunner
type PiUpdater = backendruntime.PiUpdater
type WorkspaceModelsResponse = backendruntime.WorkspaceModelsResponse
type WorkspaceSettingsResponse = backendworkspace.WorkspaceSettingsResponse
type SettingsPatchRequest = backendworkspace.SettingsPatchRequest
type AuthProviderStatus = backendauth.AuthProviderStatus
type SaveAPIKeyRequest = backendauth.SaveAPIKeyRequest
type GitHistoryCommit = backendgit.GitHistoryCommit
type GitCommitDetail = backendgit.GitCommitDetail

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

type ServerBroker interface {
	EventSink
	PublishMockPrompt(ctx context.Context, store SessionMessageStore, sessionID, text string)
	ServeSession(w http.ResponseWriter, r *http.Request, sessionID string)
	Subscribe(sessionID string) (<-chan Event, func())
}

type ServerRunner interface {
	Cancel(sessionID string) bool
	IsRunning(sessionID string) bool
	RunningSessionIDs() map[string]bool
	StartPiPrompt(parent context.Context, events EventSink, store SessionMessageStore, sessionID string, text string, images []PromptAttachment, displayText string) error
	Steer(sessionID string, text string, images []PromptAttachment) error
}

var ErrNotFound = backendstore.ErrNotFound

const PiUpdateUpdated = backendruntime.PiUpdateUpdated

func NewRunner() *Runner                            { return backendrunner.NewRunner() }
func NewPiUpdater(runner PiUpdateRunner) *PiUpdater { return backendruntime.NewPiUpdater(runner) }
func NewMockStore() *Store                          { return backendstore.NewMockStore() }
func NewWebStore(dbPath string) *Store              { return backendstore.NewWebStore(dbPath) }
func NewPiStore(sessionDir string) (*Store, error)  { return backendstore.NewPiStore(sessionDir) }
func NewAutoStore() *Store                          { return backendstore.NewAutoStore() }
func LoadWebWorkspacePaths(dbPath string) []string  { return backendstore.LoadWebWorkspacePaths(dbPath) }
func SaveWebWorkspacePaths(dbPath string, paths []string) error {
	return backendstore.SaveWebWorkspacePaths(dbPath, paths)
}
func DefaultWebDBPath() string { return backendstore.DefaultWebDBPath() }
func ValidateWorkspacePath(path string) (string, error) {
	return backendstore.ValidateWorkspacePath(path)
}
func emptyStore(dbPath string) *Store { return backendstore.EmptyStore(dbPath) }
func uniqueWorkspaceID(base string, used map[string]int) string {
	return backendstore.UniqueWorkspaceID(base, used)
}

func CloneGitWorkspace(ctx context.Context, store WorkspaceOpStore, req shared.CloneWorkspaceRequest) (Workspace, string, error) {
	return backendworkspace.CloneGitWorkspace(ctx, store, req)
}
func RunWorkspaceShellCommand(ctx context.Context, store WorkspaceOpStore, workspaceID string, command string) (shared.ShellCommandResult, error) {
	return backendworkspace.RunWorkspaceShellCommand(ctx, store, workspaceID, command)
}
func WorkspaceSettings(root string) (WorkspaceSettingsResponse, error) {
	return backendworkspace.WorkspaceSettings(root)
}
func SaveWorkspaceSettings(root string, req SettingsPatchRequest) (WorkspaceSettingsResponse, error) {
	return backendworkspace.SaveWorkspaceSettings(root, req)
}
func WorkspaceModels(ctx context.Context, root string) (WorkspaceModelsResponse, error) {
	return backendruntime.WorkspaceModels(ctx, root)
}
func fallbackWorkspaceModels(root string, err error) WorkspaceModelsResponse {
	return backendruntime.FallbackWorkspaceModels(root, err)
}
func WorkspaceRuntimeStatus(ctx context.Context, root string) (backendruntime.RuntimeStatus, error) {
	return backendruntime.WorkspaceRuntimeStatus(ctx, root)
}
func MockRuntimeStatus() backendruntime.RuntimeStatus { return backendruntime.MockRuntimeStatus() }
func DetectPiVersionStatus(ctx context.Context) (PiVersionStatus, error) {
	return backendruntime.DetectPiVersionStatus(ctx)
}
func MockPiVersionStatus() PiVersionStatus { return backendruntime.MockPiVersionStatus() }
func DetectGlobalPackageUpdates(ctx context.Context) (PiPackageUpdateStatus, error) {
	return backendruntime.DetectGlobalPackageUpdates(ctx)
}
func DetectWorkspacePackageUpdates(ctx context.Context, root string) (PiPackageUpdateStatus, error) {
	return backendruntime.DetectWorkspacePackageUpdates(ctx, root)
}
func CurrentPiModel(ctx context.Context, cwd string) (string, error) {
	return backendruntime.CurrentPiModel(ctx, cwd)
}
func parseListModelsOutput(output string) WorkspaceModelsResponse {
	return backendruntime.ParseListModelsOutput(output)
}

func SaveAPIKey(req SaveAPIKeyRequest) (AuthProviderStatus, error) {
	return backendauth.SaveAPIKey(req)
}

func ReadWorkspaceFile(root, rel string, maxBytes int64) (FileContent, error) {
	return backendfiles.ReadWorkspaceFile(root, rel, maxBytes)
}

func CreatePiSessionFile(cwd string) (Session, string, error) {
	return backendsessions.CreatePiSessionFile(cwd)
}
