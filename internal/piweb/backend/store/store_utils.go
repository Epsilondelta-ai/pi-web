package store

import (
	backendfiles "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/files"

	"errors"
	"path/filepath"
	"strconv"
	"strings"
)

var ErrNotFound = errors.New("not found")

func ValidateWorkspacePath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("path is required")
	}
	path, err := backendfiles.ExpandUserPath(path)
	if err != nil {
		return "", err
	}
	if strings.Contains(path, "\x00") {
		return "", errors.New("path contains null byte")
	}
	if strings.Contains(path, "..") && !strings.HasPrefix(path, "~") {
		clean := filepath.Clean(path)
		if strings.Contains(clean, "..") {
			return "", errors.New("path traversal is not allowed")
		}
	}
	return filepath.Clean(path), nil
}
func slug(value string) string {
	value = strings.ToLower(value)
	value = strings.TrimSpace(value)
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}
func uniqueWorkspaceID(base string, used map[string]int) string {
	used[base]++
	if used[base] == 1 {
		return base
	}
	return base + "-" + strconv.Itoa(used[base])
}

func cloneWorkspaces(workspaces []Workspace) []Workspace {
	out := append([]Workspace(nil), workspaces...)
	for i := range out {
		out[i].Sessions = append([]Session(nil), out[i].Sessions...)
		out[i].SessionCount = len(out[i].Sessions)
	}
	return out
}
