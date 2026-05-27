package piweb

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

const (
	PiUpdateIdle     = "idle"
	PiUpdateUpdating = "updating"
	PiUpdateUpdated  = "updated"
	PiUpdateFailed   = "failed"
)

type PiUpdateRunner func(ctx context.Context, source string, workspacePaths []string) error

type PiUpdater struct {
	mu     sync.Mutex
	runner PiUpdateRunner
	status PiUpdateStatus
}

func NewPiUpdater(runner PiUpdateRunner) *PiUpdater {
	if runner == nil {
		runner = RunPiUpdateCommand
	}
	return &PiUpdater{runner: runner, status: PiUpdateStatus{State: PiUpdateIdle}}
}

func RunPiUpdateCommand(ctx context.Context, source string, workspacePaths []string) error {
	if source == "" {
		// Update pi itself
		if err := runPiCommand(ctx, "", "update", "--self"); err != nil {
			return err
		}
		// Update extensions in each workspace that has packages
		for _, dir := range workspacePaths {
			if _, err := os.Stat(filepath.Join(dir, ".pi", "npm", "package.json")); err != nil {
				continue
			}
			if err := runPiCommand(ctx, dir, "update", "--extensions"); err != nil {
				return err
			}
		}
		return nil
	}
	return runPiCommand(ctx, "", "update", source)
}

func runPiCommand(ctx context.Context, dir string, args ...string) error {
	cmd := exec.CommandContext(ctx, "pi", args...)
	if dir != "" {
		cmd.Dir = dir
	}
	configureCommandProcessGroup(cmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	return cmd.Run()
}

func (u *PiUpdater) Status() PiUpdateStatus {
	u.mu.Lock()
	defer u.mu.Unlock()
	status := u.status
	// Reset terminal states so they are only shown once per update cycle.
	// The frontend reads the status on page load and after each poll;
	// without reset, every page load would re-trigger "updated"/"failed" toasts.
	if status.State == PiUpdateUpdated || status.State == PiUpdateFailed {
		u.status = PiUpdateStatus{State: PiUpdateIdle}
	}
	return status
}

func (u *PiUpdater) Start(ctx context.Context, source string, workspacePaths []string) PiUpdateStatus {
	u.mu.Lock()
	if u.status.State == PiUpdateUpdating {
		status := u.status
		u.mu.Unlock()
		return status
	}
	startedAt := time.Now().UTC().Format(time.RFC3339)
	u.status = PiUpdateStatus{State: PiUpdateUpdating, StartedAt: startedAt}
	u.mu.Unlock()

	go func() {
		err := u.runner(ctx, source, workspacePaths)
		u.mu.Lock()
		defer u.mu.Unlock()
		u.status.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		if err != nil {
			u.status.State = PiUpdateFailed
			u.status.Error = err.Error()
			return
		}
		u.status.State = PiUpdateUpdated
		u.status.Error = ""
	}()
	return PiUpdateStatus{State: PiUpdateUpdating, StartedAt: startedAt}
}
