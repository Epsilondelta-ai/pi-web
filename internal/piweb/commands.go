package piweb

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

type SlashCommand struct {
	Name        string `json:"name"`
	Command     string `json:"command"`
	Description string `json:"description,omitempty"`
	Source      string `json:"source,omitempty"`
	Scope       string `json:"scope,omitempty"`
	Path        string `json:"path,omitempty"`
}

func MockSlashCommands() []SlashCommand {
	return []SlashCommand{
		{Name: "review", Command: "/review", Description: "Review current changes", Source: "prompt", Scope: "project"},
		{Name: "skill:init-project", Command: "/skill:init-project", Description: "Use when creating a new project", Source: "skill", Scope: "project"},
		{Name: "team", Command: "/team", Description: "Coordinate a team of agents", Source: "extension", Scope: "global"},
	}
}

func ListPiCommands(ctx context.Context, cwd string) ([]SlashCommand, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pi", "--mode", "rpc", "--no-session")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PI_SKIP_VERSION_CHECK=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, _ := cmd.StderrPipe()
	var stderrBuf bytes.Buffer
	if stderr != nil {
		go func() { _, _ = stderrBuf.ReadFrom(stderr) }()
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	defer func() {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		}
		_ = cmd.Wait()
	}()

	if _, err := io.WriteString(stdin, `{"id":"commands","type":"get_commands"}`+"\n"); err != nil {
		return nil, err
	}
	_ = stdin.Close()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 8*1024*1024)
	for scanner.Scan() {
		commands, matched, err := parseCommandsRPCLine(scanner.Text())
		if err != nil {
			return nil, err
		}
		if matched {
			return commands, nil
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if output := strings.TrimSpace(stderrBuf.String()); output != "" {
		return nil, fmt.Errorf("pi get_commands failed: %s", output)
	}
	return nil, errors.New("pi get_commands returned no response")
}

func parseCommandsRPCLine(line string) ([]SlashCommand, bool, error) {
	var response struct {
		ID      string `json:"id"`
		Type    string `json:"type"`
		Command string `json:"command"`
		Success bool   `json:"success"`
		Error   string `json:"error"`
		Data    struct {
			Commands []struct {
				Name        string `json:"name"`
				Description string `json:"description"`
				Source      string `json:"source"`
				Location    string `json:"location"`
				Path        string `json:"path"`
				SourceInfo  struct {
					Path  string `json:"path"`
					Scope string `json:"scope"`
				} `json:"sourceInfo"`
			} `json:"commands"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(line), &response); err != nil {
		return nil, false, nil
	}
	if response.ID != "commands" || response.Type != "response" || response.Command != "get_commands" {
		return nil, false, nil
	}
	if !response.Success {
		if response.Error == "" {
			response.Error = "pi get_commands failed"
		}
		return nil, true, errors.New(response.Error)
	}
	commands := make([]SlashCommand, 0, len(response.Data.Commands))
	for _, item := range response.Data.Commands {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		scope := item.SourceInfo.Scope
		if scope == "" {
			scope = item.Location
		}
		path := item.SourceInfo.Path
		if path == "" {
			path = item.Path
		}
		commands = append(commands, SlashCommand{
			Name:        name,
			Command:     "/" + name,
			Description: strings.TrimSpace(item.Description),
			Source:      item.Source,
			Scope:       displayCommandScope(scope),
			Path:        path,
		})
	}
	return commands, true, nil
}

func displayCommandScope(scope string) string {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "user":
		return "global"
	case "project":
		return "project"
	case "temporary":
		return "temporary"
	case "path":
		return "path"
	default:
		return scope
	}
}
