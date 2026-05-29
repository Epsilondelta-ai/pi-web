package workspace

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
)

const commandTimeout = 30 * time.Second
const cloneTimeout = 5 * time.Minute
const maxShellOutputBytes = 256 * 1024

const shellOutputTruncatedMarker = "\n[output truncated]"

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

type Store interface {
	OpenWorkspace(path string) (shared.Workspace, error)
	WorkspacePath(workspaceID string) (string, error)
}

func CloneGitWorkspace(ctx context.Context, store Store, req shared.CloneWorkspaceRequest) (shared.Workspace, string, error) {
	parent, err := validateWorkspacePath(req.ParentPath)
	if err != nil {
		return shared.Workspace{}, "", err
	}
	if stat, err := os.Stat(parent); err != nil || !stat.IsDir() {
		return shared.Workspace{}, "", errors.New("parent path must be an existing directory")
	}
	gitURL := strings.TrimSpace(req.GitURL)
	if gitURL == "" {
		return shared.Workspace{}, "", errors.New("git url is required")
	}
	destinationName := strings.TrimSpace(req.Name)
	if destinationName == "" {
		destinationName = repoNameFromGitURL(gitURL)
	}
	if destinationName == "" || strings.ContainsAny(destinationName, `/\`) || strings.Contains(destinationName, "\x00") || destinationName == "." || destinationName == ".." {
		return shared.Workspace{}, "", errors.New("clone destination name is invalid")
	}
	destination := filepath.Join(parent, destinationName)
	if _, err := os.Stat(destination); err == nil {
		return shared.Workspace{}, "", fmt.Errorf("destination already exists: %s", destination)
	} else if !errors.Is(err, os.ErrNotExist) {
		return shared.Workspace{}, "", err
	}

	cloneCtx, cancel := context.WithTimeout(ctx, cloneTimeout)
	defer cancel()
	cmd := exec.CommandContext(cloneCtx, "git", "clone", gitURL, destinationName)
	cmd.Dir = parent
	output, err := cmd.CombinedOutput()
	if cloneCtx.Err() == context.DeadlineExceeded {
		return shared.Workspace{}, string(output), errors.New("git clone timed out")
	}
	if err != nil {
		return shared.Workspace{}, string(output), fmt.Errorf("git clone failed: %w", err)
	}
	workspace, err := store.OpenWorkspace(destination)
	return workspace, string(output), err
}

func RunWorkspaceShellCommand(ctx context.Context, store Store, workspaceID string, command string) (shared.ShellCommandResult, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return shared.ShellCommandResult{}, errors.New("command is required")
	}
	root, err := store.WorkspacePath(workspaceID)
	if err != nil {
		return shared.ShellCommandResult{}, err
	}
	cmdCtx, cancel := context.WithTimeout(ctx, commandTimeout)
	defer cancel()
	started := time.Now()
	cmd := exec.CommandContext(cmdCtx, "sh", "-lc", command)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "TERM=dumb")
	out := &cappedOutputBuffer{limit: maxShellOutputBytes}
	cmd.Stdout = out
	cmd.Stderr = out
	err = cmd.Run()
	result := shared.ShellCommandResult{
		Command:    command,
		Output:     out.Result(),
		DurationMs: int(time.Since(started).Milliseconds()),
	}
	if exitErr, ok := err.(*exec.ExitError); ok {
		result.ExitCode = exitErr.ExitCode()
		return result, nil
	}
	if cmdCtx.Err() == context.DeadlineExceeded {
		result.ExitCode = -1
		result.Output += "\n[command timed out]"
		return result, nil
	}
	return result, err
}

func validateWorkspacePath(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("workspace path is required")
	}
	expanded := path
	if strings.HasPrefix(expanded, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		expanded = filepath.Join(home, strings.TrimPrefix(expanded, "~/"))
	}
	cleaned, err := filepath.Abs(expanded)
	if err != nil {
		return "", err
	}
	return cleaned, nil
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
