package piweb

import (
	"context"

	"github.com/Epsilondelta-ai/pi-web/internal/piweb/backend"
)

type Config = backend.Config
type Server = backend.Server
type Store = backend.Store
type Broker = backend.Broker
type Runner = backend.Runner
type PiUpdater = backend.PiUpdater
type PiUpdateRunner = backend.PiUpdateRunner
type PiPackageUpdateDetector = backend.PiPackageUpdateDetector
type PiPackageUpdateStatus = backend.PiPackageUpdateStatus
type Workspace = backend.Workspace
type Session = backend.Session
type FileNode = backend.FileNode
type Message = backend.Message
type GitStatus = backend.GitStatus
type PromptAttachment = backend.PromptAttachment
type PromptRequest = backend.PromptRequest
type RenameSessionRequest = backend.RenameSessionRequest
type OpenWorkspaceRequest = backend.OpenWorkspaceRequest
type CloneWorkspaceRequest = backend.CloneWorkspaceRequest
type ShellCommandRequest = backend.ShellCommandRequest
type ShellCommandResult = backend.ShellCommandResult
type CreateFileRequest = backend.CreateFileRequest
type RenameFileRequest = backend.RenameFileRequest
type DeleteFileRequest = backend.DeleteFileRequest
type WriteFileRequest = backend.WriteFileRequest
type UploadFileRequest = backend.UploadFileRequest
type FileContent = backend.FileContent
type ErrorResponse = backend.ErrorResponse
type VersionStatus = backend.VersionStatus
type PiVersionStatus = backend.PiVersionStatus
type PiUpdateStatus = backend.PiUpdateStatus
type FolderEntry = backend.FolderEntry
type FolderListing = backend.FolderListing
type Event = backend.Event

var ErrNotFound = backend.ErrNotFound

func NewServer(config Config, store *Store, broker *Broker) *Server {
	return backend.NewServer(config, store, broker)
}
func NewAutoStore() *Store                          { return backend.NewAutoStore() }
func NewWebStore(dbPath string) *Store              { return backend.NewWebStore(dbPath) }
func NewPiStore(sessionDir string) (*Store, error)  { return backend.NewPiStore(sessionDir) }
func NewMockStore() *Store                          { return backend.NewMockStore() }
func NewBroker() *Broker                            { return backend.NewBroker() }
func NewPiUpdater(runner PiUpdateRunner) *PiUpdater { return backend.NewPiUpdater(runner) }
func DetectPiVersionStatus(ctx context.Context) (PiVersionStatus, error) {
	return backend.DetectPiVersionStatus(ctx)
}
func DetectGlobalPackageUpdates(ctx context.Context) (PiPackageUpdateStatus, error) {
	return backend.DetectGlobalPackageUpdates(ctx)
}
func DetectWorkspacePackageUpdates(ctx context.Context, root string) (PiPackageUpdateStatus, error) {
	return backend.DetectWorkspacePackageUpdates(ctx, root)
}
func RedactSecrets(text string) string { return backend.RedactSecrets(text) }
func RedactPayload(payload any) any    { return backend.RedactPayload(payload) }
