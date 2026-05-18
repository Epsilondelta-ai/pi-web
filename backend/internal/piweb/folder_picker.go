package piweb

import (
	"errors"
	"os/exec"
	"runtime"
	"strings"
)

func PickWorkspaceFolder() (string, error) {
	switch runtime.GOOS {
	case "darwin":
		out, err := exec.Command("osascript", "-e", `POSIX path of (choose folder with prompt "Choose a pi workspace")`).Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	case "linux":
		if path, err := exec.LookPath("zenity"); err == nil {
			out, err := exec.Command(path, "--file-selection", "--directory", "--title=Choose a pi workspace").Output()
			if err != nil {
				return "", err
			}
			return strings.TrimSpace(string(out)), nil
		}
		if path, err := exec.LookPath("kdialog"); err == nil {
			out, err := exec.Command(path, "--getexistingdirectory", ".", "Choose a pi workspace").Output()
			if err != nil {
				return "", err
			}
			return strings.TrimSpace(string(out)), nil
		}
		return "", errors.New("no supported folder picker found; install zenity or kdialog")
	case "windows":
		out, err := exec.Command("powershell", "-NoProfile", "-Command", `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Choose a pi workspace'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`).Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	default:
		return "", errors.New("folder picker is not supported on this platform")
	}
}
