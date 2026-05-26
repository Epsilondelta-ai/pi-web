package piweb

import (
	"bytes"
	"context"
	"os/exec"
	"sync"
	"time"
)

const (
	PiUpdateIdle     = "idle"
	PiUpdateUpdating = "updating"
	PiUpdateUpdated  = "updated"
	PiUpdateFailed   = "failed"
)

type PiUpdateRunner func(context.Context, string) error

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

func RunPiUpdateCommand(ctx context.Context, source string) error {
	args := []string{"update"}
	if source != "" {
		args = append(args, source)
	}
	cmd := exec.CommandContext(ctx, "pi", args...)
	configureCommandProcessGroup(cmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	return cmd.Run()
}

func (u *PiUpdater) Status() PiUpdateStatus {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.status
}

func (u *PiUpdater) Start(ctx context.Context, source string) PiUpdateStatus {
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
		err := u.runner(ctx, source)
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
