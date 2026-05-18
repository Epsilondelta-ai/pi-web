package piweb

import (
	"bufio"
	"context"
	"errors"
	"os/exec"
	"sync"
	"time"
)

type Runner struct {
	mu      sync.Mutex
	running map[string]context.CancelFunc
}

func NewRunner() *Runner {
	return &Runner{running: map[string]context.CancelFunc{}}
}

func (r *Runner) StartPiPrompt(parent context.Context, broker *Broker, store *Store, sessionID, text string) error {
	sessionFile, cwd, ok := store.SessionRuntime(sessionID)
	if !ok {
		return ErrNotFound
	}
	ctx, cancel := context.WithCancel(parent)
	r.mu.Lock()
	if _, exists := r.running[sessionID]; exists {
		r.mu.Unlock()
		cancel()
		return errors.New("session already running")
	}
	r.running[sessionID] = cancel
	r.mu.Unlock()

	go func() {
		defer func() {
			r.mu.Lock()
			delete(r.running, sessionID)
			r.mu.Unlock()
			cancel()
		}()
		user := Message{Kind: "user", Text: text}
		_ = store.AppendMessage(sessionID, user)
		broker.Publish(sessionID, "session.message", user)
		broker.Publish(sessionID, "session.status", map[string]string{"status": "running"})

		args := []string{"--session", sessionFile, "--print", text}
		cmd := exec.CommandContext(ctx, "pi", args...)
		cmd.Dir = cwd
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			return
		}
		stderr, _ := cmd.StderrPipe()
		if err := cmd.Start(); err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			return
		}

		var output string
		done := make(chan struct{})
		go func() {
			scanner := bufio.NewScanner(stdout)
			scanner.Buffer(make([]byte, 1024), 1024*1024)
			for scanner.Scan() {
				line := scanner.Text()
				if output != "" {
					output += "\n"
				}
				output += line
				broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
			}
			close(done)
		}()
		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": scanner.Text()})
			}
		}()
		<-done
		err = cmd.Wait()
		if err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			broker.Publish(sessionID, "session.status", map[string]string{"status": "idle"})
			return
		}
		msg := Message{Kind: "pi", Text: output}
		_ = store.AppendMessage(sessionID, msg)
		broker.Publish(sessionID, "session.message", msg)
		broker.Publish(sessionID, "session.status", map[string]string{"status": "idle", "finishedAt": time.Now().UTC().Format(time.RFC3339)})
	}()
	return nil
}

func (r *Runner) Cancel(sessionID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	cancel, ok := r.running[sessionID]
	if ok {
		cancel()
		delete(r.running, sessionID)
	}
	return ok
}
