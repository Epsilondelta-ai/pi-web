package backend

import (
	"errors"
	"path/filepath"
	"strings"
)

var ErrNotFound = errors.New("not found")

func ValidateWorkspacePath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("path is required")
	}
	path, err := ExpandUserPath(path)
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
func cloneWorkspaces(workspaces []Workspace) []Workspace {
	out := append([]Workspace(nil), workspaces...)
	for i := range out {
		out[i].Sessions = append([]Session(nil), out[i].Sessions...)
		out[i].SessionCount = len(out[i].Sessions)
	}
	return out
}
