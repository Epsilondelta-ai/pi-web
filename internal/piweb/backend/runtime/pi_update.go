package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	backendworkspace "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/workspace"
)

const (
	PiUpdateIdle     = "idle"
	PiUpdateUpdating = "updating"
	PiUpdateUpdated  = "updated"
	PiUpdateFailed   = "failed"
)

type PiUpdateRunner func(ctx context.Context, source string, workspaceDir string) error

type PiUpdater struct {
	mu     sync.Mutex
	runner PiUpdateRunner
	status PiUpdateStatus
}

func NewPiUpdater(runner PiUpdateRunner) *PiUpdater {
	if runner == nil {
		runner = RunPiUpdateCommand
	}
	return &PiUpdater{runner: runner, status: PiUpdateStatus{State: PiUpdateIdle}}
}

func RunPiUpdateCommand(ctx context.Context, source string, workspaceDir string) error {
	if workspaceDir != "" {
		if err := syncWorkspaceNpmPackageVersions(ctx, workspaceDir); err != nil {
			return err
		}
		return runPiCommand(ctx, workspaceDir, "update", "--extensions")
	}
	if source != "" {
		return runPiCommand(ctx, "", "update", source)
	}
	if err := syncGlobalNpmPackageVersions(ctx); err != nil {
		return err
	}
	return runPiCommand(ctx, "", "update")
}

func syncGlobalNpmPackageVersions(ctx context.Context) error {
	status, err := DetectGlobalPackageUpdates(ctx)
	if err != nil || len(status.Updates) == 0 {
		return err
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	globalSettingsPath := filepath.Join(home, ".pi", "agent", "settings.json")
	settings, _ := backendworkspace.ReadSettingsFile(globalSettingsPath)
	return syncNpmPackageVersions(ctx, filepath.Join(home, ".pi", "agent", "npm"), status.Updates, npmCommandFromSettings(settings))
}

func syncWorkspaceNpmPackageVersions(ctx context.Context, workspaceDir string) error {
	status, err := DetectWorkspacePackageUpdates(ctx, workspaceDir)
	if err != nil || len(status.Updates) == 0 {
		return err
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	settings, _ := backendworkspace.ReadSettingsFile(filepath.Join(home, ".pi", "agent", "settings.json"))
	return syncNpmPackageVersions(ctx, filepath.Join(workspaceDir, ".pi", "npm"), status.Updates, npmCommandFromSettings(settings))
}

func syncNpmPackageVersions(ctx context.Context, npmDir string, updates []PiPackageUpdate, npmCommand []string) error {
	packageJSONPath := filepath.Join(npmDir, "package.json")
	content, err := os.ReadFile(packageJSONPath)
	if err != nil {
		return nil
	}
	var manifest map[string]any
	if err := json.Unmarshal(content, &manifest); err != nil {
		return err
	}
	changed := false
	for _, update := range updates {
		if update.Type != "npm" || update.DisplayName == "" || update.LatestVersion == "" {
			continue
		}
		if setManifestDependencyVersion(manifest, update.DisplayName, "^"+update.LatestVersion) {
			changed = true
		}
	}
	if !changed {
		return nil
	}
	updated, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	updated = append(updated, '\n')
	if err := os.WriteFile(packageJSONPath, updated, 0o644); err != nil {
		return err
	}
	if err := resetNpmInstallState(npmDir); err != nil {
		return err
	}
	return runNpmInstall(ctx, npmDir, npmCommand)
}

func resetNpmInstallState(npmDir string) error {
	for _, name := range []string{"node_modules", "package-lock.json", "package.lock.json"} {
		if err := os.RemoveAll(filepath.Join(npmDir, name)); err != nil {
			return err
		}
	}
	return nil
}

func setManifestDependencyVersion(manifest map[string]any, name string, version string) bool {
	sections := []string{"dependencies", "devDependencies", "optionalDependencies", "peerDependencies"}
	for _, section := range sections {
		deps, ok := manifest[section].(map[string]any)
		if !ok {
			continue
		}
		if _, ok := deps[name]; ok {
			deps[name] = version
			return true
		}
	}
	deps, ok := manifest["dependencies"].(map[string]any)
	if !ok {
		deps = map[string]any{}
		manifest["dependencies"] = deps
	}
	deps[name] = version
	return true
}

func runNpmInstall(ctx context.Context, dir string, npmCommand []string) error {
	command := "npm"
	args := []string{"install"}
	if len(npmCommand) > 0 {
		command = npmCommand[0]
		args = append(append([]string{}, npmCommand[1:]...), "install")
	}
	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Dir = dir
	configureCommandProcessGroup(cmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	return cmd.Run()
}

func runPiCommand(ctx context.Context, dir string, args ...string) error {
	cmd := exec.CommandContext(ctx, "pi", args...)
	if dir != "" {
		cmd.Dir = dir
	}
	configureCommandProcessGroup(cmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	return cmd.Run()
}

func (u *PiUpdater) Status() PiUpdateStatus {
	u.mu.Lock()
	defer u.mu.Unlock()
	status := u.status
	// Reset terminal states so they are only shown once per update cycle.
	// The frontend reads the status on page load and after each poll;
	// without reset, every page load would re-trigger "updated"/"failed" toasts.
	if status.State == PiUpdateUpdated || status.State == PiUpdateFailed {
		u.status = PiUpdateStatus{State: PiUpdateIdle}
	}
	return status
}

func (u *PiUpdater) Start(ctx context.Context, source string, workspaceDir string) PiUpdateStatus {
	u.mu.Lock()
	if u.status.State == PiUpdateUpdating {
		status := u.status
		u.mu.Unlock()
		return status
	}
	startedAt := time.Now().UTC().Format(time.RFC3339)
	u.status = PiUpdateStatus{State: PiUpdateUpdating, StartedAt: startedAt}
	u.mu.Unlock()

	go func() {
		err := u.runner(ctx, source, workspaceDir)
		u.mu.Lock()
		defer u.mu.Unlock()
		u.status.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		if err != nil {
			u.status.State = PiUpdateFailed
			u.status.Error = err.Error()
			return
		}
		u.status.State = PiUpdateUpdated
		u.status.Error = ""
	}()
	return PiUpdateStatus{State: PiUpdateUpdating, StartedAt: startedAt}
}
