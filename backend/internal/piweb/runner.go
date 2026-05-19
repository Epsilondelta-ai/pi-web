package piweb

import (
	"context"
	"encoding/base64"
	"errors"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const fallbackChoiceSystemPrompt = `Pi Web UI fallback choice protocol:
- You are running inside Pi Web UI.
- When you need the user to choose between options, or the user asks you to ask a choice question, output a fenced json block with top-level type "piweb_choice".
- Stop after emitting the fallback block and wait for the user's follow-up.
- When the user later sends:
  선택지 응답:
  id: <id>
  value: <value>
  continue using that id/value as the selected answer.
- Required schema:
  {"type":"piweb_choice","id":"stable-choice-id","question":"Question text","options":[{"label":"Option A","value":"A","description":"What A means"}],"allowCustom":false}
- Keep id stable, short, and unique. Use at most 8 options. Use inert plain text only.`

type Runner struct {
	mu      sync.Mutex
	running map[string]context.CancelFunc
}

func NewRunner() *Runner {
	return &Runner{running: map[string]context.CancelFunc{}}
}
func (r *Runner) StartPiPrompt(
	parent context.Context,
	broker *Broker,
	store *Store,
	sessionID string,
	text string,
	images []PromptAttachment,
	displayText string,
) error {
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
		user := Message{Kind: "user", Text: displayText, Attachments: images}
		_ = store.AppendMessage(sessionID, user)
		broker.Publish(sessionID, "session.message", user)
		broker.Publish(sessionID, "session.status", map[string]string{"status": "running"})

		imagePaths, cleanup, err := writePromptImages(images)
		if err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			broker.Publish(sessionID, "session.status", map[string]string{"status": "idle"})
			return
		}
		defer cleanup()

		args := piPromptArgs(sessionFile, text, imagePaths)
		cmd := exec.CommandContext(ctx, "pi", args...)
		cmd.Dir = cwd
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
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
		go func() {
			<-ctx.Done()
			if cmd.Process != nil {
				_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
			}
		}()

		state := &jsonStreamState{}
		stdoutDone := make(chan struct{})
		go streamPipe(stdout, func(line string) {
			if !handlePiJSONEvent(line, broker, store, sessionID, state) {
				broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
			}
		}, stdoutDone)
		go streamPipe(stderr, func(line string) {
			broker.Publish(sessionID, "tool.output", map[string]string{"tool": "pi", "chunk": line})
		}, nil)

		<-stdoutDone
		err = cmd.Wait()
		if err != nil {
			broker.Publish(sessionID, "error", map[string]string{"error": err.Error()})
			broker.Publish(sessionID, "session.status", map[string]string{"status": "idle"})
			return
		}
		broker.Publish(sessionID, "session.status", map[string]string{
			"status":     "idle",
			"finishedAt": time.Now().UTC().Format(time.RFC3339),
		})
	}()
	return nil
}
func piPromptArgs(sessionFile, text string, imagePaths []string) []string {
	args := []string{
		"--session", sessionFile,
		"--mode", "json",
		"--append-system-prompt", fallbackChoiceSystemPrompt,
		"--print",
	}
	for _, path := range imagePaths {
		args = append(args, "@"+path)
	}
	if strings.TrimSpace(text) != "" {
		args = append(args, text)
	}
	return args
}

func writePromptImages(images []PromptAttachment) ([]string, func(), error) {
	if len(images) == 0 {
		return nil, func() {}, nil
	}
	dir, err := os.MkdirTemp("", "pi-web-images-*")
	if err != nil {
		return nil, func() {}, err
	}
	cleanup := func() { _ = os.RemoveAll(dir) }
	paths := make([]string, 0, len(images))
	for index, image := range images {
		data, err := decodeDataURL(image.DataURL)
		if err != nil {
			cleanup()
			return nil, func() {}, err
		}
		path := filepath.Join(dir, imageFileName(image, index))
		if err := os.WriteFile(path, data, 0o600); err != nil {
			cleanup()
			return nil, func() {}, err
		}
		paths = append(paths, path)
	}
	return paths, cleanup, nil
}

func decodeDataURL(dataURL string) ([]byte, error) {
	comma := strings.Index(dataURL, ",")
	if comma < 0 {
		return base64.StdEncoding.DecodeString(dataURL)
	}
	return base64.StdEncoding.DecodeString(dataURL[comma+1:])
}

func imageFileName(image PromptAttachment, index int) string {
	name := filepath.Base(strings.TrimSpace(image.Name))
	if name == "." || name == string(filepath.Separator) || name == "" {
		name = "image-" + strconv.Itoa(index+1) + imageExtension(image.MIMEType)
	}
	return url.PathEscape(name)
}

func imageExtension(mimeType string) string {
	subtype := strings.TrimPrefix(strings.ToLower(mimeType), "image/")
	subtype = strings.Split(subtype, ";")[0]
	switch subtype {
	case "jpeg":
		return ".jpg"
	case "png", "gif", "webp", "bmp":
		return "." + subtype
	case "svg+xml":
		return ".svg"
	default:
		return ".png"
	}
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
