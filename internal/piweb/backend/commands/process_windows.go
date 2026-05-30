//go:build windows

package commands

import "os/exec"

func configureCommandProcessGroup(cmd *exec.Cmd) {}

func terminateCommandProcessGroup(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	_ = cmd.Process.Kill()
}
