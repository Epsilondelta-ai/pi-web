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
	"time"
)

func CurrentPiModel(ctx context.Context, cwd string) (string, error) {
	status, err := CurrentPiModelStatus(ctx, cwd)
	return status.Model, err
}

func CurrentPiModelStatus(ctx context.Context, cwd string) (RuntimeStatus, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pi", "--mode", "rpc", "--no-session")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PI_SKIP_VERSION_CHECK=1")
	configureCommandProcessGroup(cmd)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return RuntimeStatus{}, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return RuntimeStatus{}, err
	}
	stderr, _ := cmd.StderrPipe()
	var stderrBuf bytes.Buffer
	if stderr != nil {
		go func() { _, _ = stderrBuf.ReadFrom(stderr) }()
	}
	if err := cmd.Start(); err != nil {
		return RuntimeStatus{}, err
	}
	defer func() {
		terminateCommandProcessGroup(cmd)
		_ = cmd.Wait()
	}()

	if _, err := io.WriteString(stdin, `{"id":"state","type":"get_state"}`+"\n"); err != nil {
		return RuntimeStatus{}, err
	}
	_ = stdin.Close()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		status, matched, err := parseStateModelStatusRPCLine(scanner.Text())
		if err != nil {
			return RuntimeStatus{}, err
		}
		if matched {
			return status, nil
		}
	}
	if err := scanner.Err(); err != nil {
		return RuntimeStatus{}, err
	}
	if ctx.Err() != nil {
		return RuntimeStatus{}, ctx.Err()
	}
	if output := strings.TrimSpace(stderrBuf.String()); output != "" {
		return RuntimeStatus{}, fmt.Errorf("pi get_state failed: %s", output)
	}
	return RuntimeStatus{}, fmt.Errorf("pi get_state returned no response")
}

func parseStateModelRPCLine(line string) (string, bool, error) {
	status, matched, err := parseStateModelStatusRPCLine(line)
	return status.Model, matched, err
}

func parseStateModelStatusRPCLine(line string) (RuntimeStatus, bool, error) {
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
			ThinkingLevel string `json:"thinkingLevel"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(line), &response); err != nil {
		return RuntimeStatus{}, false, nil
	}
	if response.ID != "state" || response.Type != "response" || response.Command != "get_state" {
		return RuntimeStatus{}, false, nil
	}
	if !response.Success {
		if response.Error == "" {
			response.Error = "pi get_state failed"
		}
		return RuntimeStatus{}, true, fmt.Errorf("%s", response.Error)
	}
	if response.Data.Model == nil {
		return RuntimeStatus{}, true, nil
	}
	model := strings.TrimSpace(response.Data.Model.Name)
	if model == "" {
		model = strings.TrimSpace(response.Data.Model.ID)
	}
	if model == "" {
		model = strings.TrimSpace(response.Data.Model.Provider)
	}
	return RuntimeStatus{
		Model:         model,
		ModelProvider: strings.TrimSpace(response.Data.Model.Provider),
		ThinkingLevel: strings.TrimSpace(response.Data.ThinkingLevel),
	}, true, nil
}
