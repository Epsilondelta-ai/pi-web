package piweb

import (
	"path/filepath"
	"strings"
)

func parsedWorkspaceSessionDir(sessionRoot, sessionFile string) string {
	rel, err := filepath.Rel(sessionRoot, sessionFile)
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." {
		return filepath.Dir(sessionFile)
	}
	parts := strings.Split(rel, string(filepath.Separator))
	if len(parts) > 1 && parts[0] != "" {
		return filepath.Join(sessionRoot, parts[0])
	}
	return sessionRoot
}
