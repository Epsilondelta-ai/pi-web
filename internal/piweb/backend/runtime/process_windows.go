//go:build windows

package runtime

import "os/exec"

func configureCommandProcessGroup(_ *exec.Cmd) {}

func terminateCommandProcessGroup(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	_ = cmd.Process.Kill()
}
