package piweb

import (
	"context"

	"github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/runtime"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/server"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/store"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
)

type Config = server.Config
type Server = server.Server
type Store = store.Store
type Broker = server.Broker
type Runner = server.Runner
type PiUpdater = runtime.PiUpdater
type PiUpdateRunner = runtime.PiUpdateRunner
type PiPackageUpdateDetector = runtime.PiPackageUpdateDetector
type PiPackageUpdateStatus = runtime.PiPackageUpdateStatus
type Workspace = shared.Workspace
type Session = shared.Session
type FileNode = shared.FileNode
type Message = shared.Message
type GitStatus = shared.GitStatus
type PromptAttachment = shared.PromptAttachment
type PromptRequest = shared.PromptRequest
type RenameSessionRequest = shared.RenameSessionRequest
type OpenWorkspaceRequest = shared.OpenWorkspaceRequest
type CloneWorkspaceRequest = shared.CloneWorkspaceRequest
type ShellCommandRequest = shared.ShellCommandRequest
type ShellCommandResult = shared.ShellCommandResult
type CreateFileRequest = shared.CreateFileRequest
type RenameFileRequest = shared.RenameFileRequest
type DeleteFileRequest = shared.DeleteFileRequest
type WriteFileRequest = shared.WriteFileRequest
type UploadFileRequest = shared.UploadFileRequest
type FileContent = shared.FileContent
type ErrorResponse = shared.ErrorResponse
type VersionStatus = shared.VersionStatus
type PiVersionStatus = shared.PiVersionStatus
type PiUpdateStatus = shared.PiUpdateStatus
type FolderEntry = shared.FolderEntry
type FolderListing = shared.FolderListing
type Event = shared.Event

var ErrNotFound = store.ErrNotFound

func NewServer(config Config, store *Store, broker *Broker) *Server {
	return server.NewServer(config, store, broker)
}
func NewAutoStore() *Store                          { return store.NewAutoStore() }
func NewWebStore(dbPath string) *Store              { return store.NewWebStore(dbPath) }
func NewPiStore(sessionDir string) (*Store, error)  { return store.NewPiStore(sessionDir) }
func NewMockStore() *Store                          { return store.NewMockStore() }
func NewBroker() *Broker                            { return server.NewBroker() }
func NewPiUpdater(runner PiUpdateRunner) *PiUpdater { return runtime.NewPiUpdater(runner) }
func DetectPiVersionStatus(ctx context.Context) (PiVersionStatus, error) {
	return runtime.DetectPiVersionStatus(ctx)
}
func DetectGlobalPackageUpdates(ctx context.Context) (PiPackageUpdateStatus, error) {
	return runtime.DetectGlobalPackageUpdates(ctx)
}
func DetectWorkspacePackageUpdates(ctx context.Context, root string) (PiPackageUpdateStatus, error) {
	return runtime.DetectWorkspacePackageUpdates(ctx, root)
}
func RedactSecrets(text string) string { return shared.RedactSecrets(text) }
func RedactPayload(payload any) any    { return shared.RedactPayload(payload) }
