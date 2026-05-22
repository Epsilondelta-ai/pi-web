package piweb

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
)

const commandTimeout = 30 * time.Second
const cloneTimeout = 5 * time.Minute

func CloneGitWorkspace(ctx context.Context, store *Store, req CloneWorkspaceRequest) (Workspace, string, error) {
	parent, err := ValidateWorkspacePath(req.ParentPath)
	if err != nil {
		return Workspace{}, "", err
	}
	if stat, err := os.Stat(parent); err != nil || !stat.IsDir() {
		return Workspace{}, "", errors.New("parent path must be an existing directory")
	}
	gitURL := strings.TrimSpace(req.GitURL)
	if gitURL == "" {
		return Workspace{}, "", errors.New("git url is required")
	}
	destinationName := strings.TrimSpace(req.Name)
	if destinationName == "" {
		destinationName = repoNameFromGitURL(gitURL)
	}
	if destinationName == "" || strings.ContainsAny(destinationName, `/\`) || strings.Contains(destinationName, "\x00") || destinationName == "." || destinationName == ".." {
		return Workspace{}, "", errors.New("clone destination name is invalid")
	}
	destination := filepath.Join(parent, destinationName)
	if _, err := os.Stat(destination); err == nil {
		return Workspace{}, "", fmt.Errorf("destination already exists: %s", destination)
	} else if !errors.Is(err, os.ErrNotExist) {
		return Workspace{}, "", err
	}

	cloneCtx, cancel := context.WithTimeout(ctx, cloneTimeout)
	defer cancel()
	cmd := exec.CommandContext(cloneCtx, "git", "clone", gitURL, destinationName)
	cmd.Dir = parent
	output, err := cmd.CombinedOutput()
	if cloneCtx.Err() == context.DeadlineExceeded {
		return Workspace{}, string(output), errors.New("git clone timed out")
	}
	if err != nil {
		return Workspace{}, string(output), fmt.Errorf("git clone failed: %w", err)
	}
	workspace, err := store.OpenWorkspace(destination)
	return workspace, string(output), err
}

func RunWorkspaceShellCommand(ctx context.Context, store *Store, workspaceID string, command string) (ShellCommandResult, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return ShellCommandResult{}, errors.New("command is required")
	}
	root, err := store.WorkspacePath(workspaceID)
	if err != nil {
		return ShellCommandResult{}, err
	}
	cmdCtx, cancel := context.WithTimeout(ctx, commandTimeout)
	defer cancel()
	started := time.Now()
	cmd := exec.CommandContext(cmdCtx, "sh", "-lc", command)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "TERM=dumb")
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err = cmd.Run()
	result := ShellCommandResult{Command: command, Output: out.String(), DurationMs: int(time.Since(started).Milliseconds())}
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

func repoNameFromGitURL(raw string) string {
	trimmed := strings.TrimSuffix(strings.TrimSpace(raw), "/")
	if parsed, err := url.Parse(trimmed); err == nil && parsed.Path != "" {
		trimmed = parsed.Path
	}
	name := filepath.Base(trimmed)
	name = strings.TrimSuffix(name, ".git")
	return name
}
