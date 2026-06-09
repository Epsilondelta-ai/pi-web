package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

func pluginBackendCommand(ctx context.Context, id string, plugin pluginManifest, method, workspaceRoot string) (*exec.Cmd, error) {
	backendPath := filepath.Join(pluginRoot(), id, plugin.Backend)
	if filepath.Ext(plugin.Backend) != ".go" {
		return exec.CommandContext(ctx, "node", backendPath, method, workspaceRoot), nil
	}
	binaryPath, err := buildGoPluginBackend(ctx, id, backendPath)
	if err != nil {
		return nil, err
	}
	return exec.CommandContext(ctx, binaryPath, method, workspaceRoot), nil
}

func buildGoPluginBackend(ctx context.Context, id, backendPath string) (string, error) {
	binaryPath := filepath.Join(pluginRoot(), id, ".pi-web-backend-bin")
	backendInfo, err := os.Stat(backendPath)
	if err != nil {
		return "", err
	}
	binaryInfo, err := os.Stat(binaryPath)
	if err == nil && !binaryInfo.ModTime().Before(backendInfo.ModTime()) {
		return binaryPath, nil
	}
	cmd := exec.CommandContext(ctx, "go", "build", "-o", binaryPath, backendPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return "", errors.New(message)
	}
	return binaryPath, nil
}

func runPluginBackendCommand(cmd *exec.Cmd) ([]byte, error) {
	timer := time.AfterFunc(10*time.Second, func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	})
	defer timer.Stop()
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return nil, errors.New(message)
	}
	trimmed := bytes.TrimSpace(output)
	if !json.Valid(trimmed) {
		return nil, errors.New("plugin backend returned invalid json")
	}
	return trimmed, nil
}

func streamPluginBackendCommand(w http.ResponseWriter, cmd *exec.Cmd) error {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	stderrBuffer := &cappedBuffer{limit: 64 * 1024}
	go func() {
		_, _ = io.Copy(stderrBuffer, stderr)
	}()
	_, copyErr := io.Copy(flushWriter{writer: w}, stdout)
	waitErr := cmd.Wait()

	if copyErr != nil {
		return copyErr
	}
	if waitErr != nil {
		message := strings.TrimSpace(stderrBuffer.String())
		if message == "" {
			message = waitErr.Error()
		}
		return errors.New(message)
	}
	return nil
}

type cappedBuffer struct {
	mu    sync.Mutex
	data  bytes.Buffer
	limit int
}

func (buffer *cappedBuffer) Write(data []byte) (int, error) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	remaining := buffer.limit - buffer.data.Len()
	if remaining > 0 {
		if len(data) > remaining {
			_, _ = buffer.data.Write(data[:remaining])
		} else {
			_, _ = buffer.data.Write(data)
		}
	}
	return len(data), nil
}

func (buffer *cappedBuffer) String() string {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.data.String()
}

type flushWriter struct {
	writer io.Writer
}

func (writer flushWriter) Write(data []byte) (int, error) {
	written, err := writer.writer.Write(data)
	if flusher, ok := writer.writer.(http.Flusher); ok {
		flusher.Flush()
	}
	return written, err
}
