package piweb

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

func CurrentPiModel(ctx context.Context, cwd string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pi", "--mode", "rpc", "--no-session")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PI_SKIP_VERSION_CHECK=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	stderr, _ := cmd.StderrPipe()
	var stderrBuf bytes.Buffer
	if stderr != nil {
		go func() { _, _ = stderrBuf.ReadFrom(stderr) }()
	}
	if err := cmd.Start(); err != nil {
		return "", err
	}
	defer func() {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		}
		_ = cmd.Wait()
	}()

	if _, err := io.WriteString(stdin, `{"id":"state","type":"get_state"}`+"\n"); err != nil {
		return "", err
	}
	_ = stdin.Close()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		model, matched, err := parseStateModelRPCLine(scanner.Text())
		if err != nil {
			return "", err
		}
		if matched {
			return model, nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if output := strings.TrimSpace(stderrBuf.String()); output != "" {
		return "", fmt.Errorf("pi get_state failed: %s", output)
	}
	return "", fmt.Errorf("pi get_state returned no response")
}

func parseStateModelRPCLine(line string) (string, bool, error) {
	var response struct {
		ID      string `json:"id"`
		Type    string `json:"type"`
		Command string `json:"command"`
		Success bool   `json:"success"`
		Error   string `json:"error"`
		Data    struct {
			Model *struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Provider string `json:"provider"`
			} `json:"model"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(line), &response); err != nil {
		return "", false, nil
	}
	if response.ID != "state" || response.Type != "response" || response.Command != "get_state" {
		return "", false, nil
	}
	if !response.Success {
		if response.Error == "" {
			response.Error = "pi get_state failed"
		}
		return "", true, fmt.Errorf("%s", response.Error)
	}
	if response.Data.Model == nil {
		return "", true, nil
	}
	if strings.TrimSpace(response.Data.Model.Name) != "" {
		return response.Data.Model.Name, true, nil
	}
	if strings.TrimSpace(response.Data.Model.ID) != "" {
		return response.Data.Model.ID, true, nil
	}
	return response.Data.Model.Provider, true, nil
}
