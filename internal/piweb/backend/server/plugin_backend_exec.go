package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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
