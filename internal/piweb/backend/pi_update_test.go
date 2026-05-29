package backend

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestPiUpdaterStatusResetsAfterRead(t *testing.T) {
	var called atomic.Int32
	runner := func(_ context.Context, _ string, _ string) error {
		called.Add(1)
		return nil
	}
	u := NewPiUpdater(runner)

	// Start an update
	result := u.Start(context.Background(), "", "")
	if result.State != PiUpdateUpdating {
		t.Fatalf("expected updating, got %q", result.State)
	}

	// Wait for completion
	time.Sleep(100 * time.Millisecond)

	// First read should return "updated" and reset to idle
	status1 := u.Status()
	if status1.State != PiUpdateUpdated {
		t.Fatalf("expected updated, got %q", status1.State)
	}

	// Second read should return idle (reset)
	status2 := u.Status()
	if status2.State != PiUpdateIdle {
		t.Fatalf("expected idle after reset, got %q", status2.State)
	}
}

func TestPiUpdaterStatusResetsFailedAfterRead(t *testing.T) {
	runner := func(_ context.Context, _ string, _ string) error {
		return errTestUpdate
	}
	u := NewPiUpdater(runner)

	u.Start(context.Background(), "", "")
	time.Sleep(100 * time.Millisecond)

	status1 := u.Status()
	if status1.State != PiUpdateFailed {
		t.Fatalf("expected failed, got %q", status1.State)
	}

	status2 := u.Status()
	if status2.State != PiUpdateIdle {
		t.Fatalf("expected idle after reset, got %q", status2.State)
	}
}

func TestPiUpdaterRejectsConcurrentStart(t *testing.T) {
	block := make(chan struct{})
	runner := func(_ context.Context, _ string, _ string) error {
		<-block
		return nil
	}
	u := NewPiUpdater(runner)

	u.Start(context.Background(), "", "")

	// Second start while updating should return the existing status
	result := u.Start(context.Background(), "", "")
	if result.State != PiUpdateUpdating {
		t.Fatalf("expected updating on concurrent start, got %q", result.State)
	}

	close(block)
	time.Sleep(50 * time.Millisecond)
}

var errTestUpdate = errors.New("test update error")
