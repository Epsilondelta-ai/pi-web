package backend

import backendstore "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/store"

type Store = backendstore.Store

var ErrNotFound = backendstore.ErrNotFound

func NewAutoStore() *Store                         { return backendstore.NewAutoStore() }
func NewWebStore(dbPath string) *Store             { return backendstore.NewWebStore(dbPath) }
func NewPiStore(sessionDir string) (*Store, error) { return backendstore.NewPiStore(sessionDir) }
func NewMockStore() *Store                         { return backendstore.NewMockStore() }
func LoadWebWorkspacePaths(dbPath string) []string { return backendstore.LoadWebWorkspacePaths(dbPath) }
func SaveWebWorkspacePaths(dbPath string, paths []string) error {
	return backendstore.SaveWebWorkspacePaths(dbPath, paths)
}
func ValidateWorkspacePath(path string) (string, error) {
	return backendstore.ValidateWorkspacePath(path)
}
func DefaultWebDBPath() string        { return backendstore.DefaultWebDBPath() }
func emptyStore(dbPath string) *Store { return backendstore.EmptyStore(dbPath) }
func uniqueWorkspaceID(base string, used map[string]int) string {
	return backendstore.UniqueWorkspaceID(base, used)
}
