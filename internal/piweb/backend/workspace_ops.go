package backend

import (
	"bytes"
	"context"
	"net/url"
	"path/filepath"
	"strings"

	backendworkspace "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/workspace"
)

type WorkspaceOpStore = backendworkspace.WorkspaceOpStore

const (
	maxShellOutputBytes        = 256 * 1024
	shellOutputTruncatedMarker = "\n[output truncated]"
)

type cappedOutputBuffer struct {
	buf       bytes.Buffer
	limit     int
	truncated bool
}

func (b *cappedOutputBuffer) Write(p []byte) (int, error) {
	if b.limit <= 0 {
		return len(p), nil
	}
	remaining := b.limit - b.buf.Len()
	if remaining > 0 {
		if remaining > len(p) {
			remaining = len(p)
		}
		_, _ = b.buf.Write(p[:remaining])
	}
	if remaining < len(p) {
		b.truncated = true
	}
	return len(p), nil
}

func (b *cappedOutputBuffer) Result() string {
	output := b.buf.String()
	if b.truncated {
		return output + shellOutputTruncatedMarker
	}
	return output
}

func CloneGitWorkspace(ctx context.Context, store WorkspaceOpStore, req CloneWorkspaceRequest) (Workspace, string, error) {
	return backendworkspace.CloneGitWorkspace(ctx, store, req)
}

func RunWorkspaceShellCommand(ctx context.Context, store WorkspaceOpStore, workspaceID string, command string) (ShellCommandResult, error) {
	return backendworkspace.RunWorkspaceShellCommand(ctx, store, workspaceID, command)
}

func repoNameFromGitURL(raw string) string {
	trimmed := strings.TrimSuffix(strings.TrimSpace(raw), "/")
	if parsed, err := url.Parse(trimmed); err == nil && parsed.Path != "" {
		trimmed = parsed.Path
	}
	name := filepath.Base(trimmed)
	name = strings.TrimSuffix(name, ".git")
	return name
}
