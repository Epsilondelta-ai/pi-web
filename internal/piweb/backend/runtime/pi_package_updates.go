package runtime

import (
	"context"
	"encoding/json"
	backendworkspace "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/workspace"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type PiPackageUpdateDetector func(context.Context) (PiPackageUpdateStatus, error)

type PiPackageUpdateStatus struct {
	Updates     []PiPackageUpdate `json:"updates"`
	Scope       string            `json:"scope,omitempty"`
	WorkspaceID string            `json:"workspaceId,omitempty"`
	Error       string            `json:"error,omitempty"`
}

type PiPackageUpdate struct {
	Source         string `json:"source"`
	DisplayName    string `json:"displayName"`
	Type           string `json:"type"`
	Scope          string `json:"scope"`
	CurrentVersion string `json:"currentVersion,omitempty"`
	LatestVersion  string `json:"latestVersion,omitempty"`
}

type configuredPiPackage struct {
	Source string
	Scope  string
}

var npmPackageSpecPattern = regexp.MustCompile(`^(@?[^@]+(?:/[^@]+)?)(?:@(.+))?$`)

func DetectGlobalPackageUpdates(ctx context.Context) (PiPackageUpdateStatus, error) {
	if os.Getenv("PI_OFFLINE") != "" {
		return PiPackageUpdateStatus{}, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return PiPackageUpdateStatus{}, err
	}
	globalSettingsPath := filepath.Join(home, ".pi", "agent", "settings.json")
	globalSettings, err := backendworkspace.ReadSettingsFile(globalSettingsPath)
	if err != nil {
		return PiPackageUpdateStatus{}, err
	}
	npmCmd := npmCommandFromSettings(globalSettings)
	updates := make([]PiPackageUpdate, 0)
	for _, pkg := range piPackagesFromSettings(globalSettings, "user") {
		if isPinnedPackage(pkg.Source) {
			continue
		}
		update, ok := checkNpmPackageUpdate(ctx, pkg, home, globalSettingsPath, npmCmd)
		if ok {
			updates = append(updates, update)
		}
	}
	return PiPackageUpdateStatus{Updates: updates, Scope: "global"}, nil
}

func DetectWorkspacePackageUpdates(ctx context.Context, workspacePath string) (PiPackageUpdateStatus, error) {
	if os.Getenv("PI_OFFLINE") != "" {
		return PiPackageUpdateStatus{}, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return PiPackageUpdateStatus{}, err
	}
	globalSettingsPath := filepath.Join(home, ".pi", "agent", "settings.json")
	globalSettings, err := backendworkspace.ReadSettingsFile(globalSettingsPath)
	if err != nil {
		return PiPackageUpdateStatus{}, err
	}
	projectSettingsPath := filepath.Join(workspacePath, ".pi", "settings.json")
	projectSettings, err := backendworkspace.ReadSettingsFile(projectSettingsPath)
	if err != nil {
		return PiPackageUpdateStatus{}, err
	}
	npmCmd := npmCommandFromSettings(globalSettings)
	updates := make([]PiPackageUpdate, 0)
	for _, pkg := range piPackagesFromSettings(projectSettings, "project") {
		if isPinnedPackage(pkg.Source) {
			continue
		}
		update, ok := checkNpmPackageUpdate(ctx, pkg, workspacePath, globalSettingsPath, npmCmd)
		if ok {
			updates = append(updates, update)
		}
	}
	return PiPackageUpdateStatus{Updates: updates, Scope: "workspace"}, nil
}

func isPinnedPackage(source string) bool {
	_, pinned, ok := parseNpmPiPackageSource(source)
	return ok && pinned
}

func piPackagesFromSettings(settings map[string]any, scope string) []configuredPiPackage {
	rawPackages, ok := settings["packages"].([]any)
	if !ok {
		return nil
	}
	packages := make([]configuredPiPackage, 0, len(rawPackages))
	for _, raw := range rawPackages {
		source := ""
		switch value := raw.(type) {
		case string:
			source = value
		case map[string]any:
			if rawSource, ok := value["source"].(string); ok {
				source = rawSource
			}
		}
		source = strings.TrimSpace(source)
		if source != "" {
			packages = append(packages, configuredPiPackage{Source: source, Scope: scope})
		}
	}
	return packages
}

func dedupePiPackages(packages []configuredPiPackage) []configuredPiPackage {
	seen := map[string]bool{}
	out := make([]configuredPiPackage, 0, len(packages))
	for _, pkg := range packages {
		key := piPackageIdentity(pkg.Source)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, pkg)
	}
	return out
}

func piPackageIdentity(source string) string {
	name, _, ok := parseNpmPiPackageSource(source)
	if !ok {
		return ""
	}
	return "npm:" + name
}

func checkNpmPackageUpdate(ctx context.Context, pkg configuredPiPackage, cwd string, globalSettingsPath string, npmCommand []string) (PiPackageUpdate, bool) {
	name, pinned, ok := parseNpmPiPackageSource(pkg.Source)
	if !ok || pinned {
		return PiPackageUpdate{}, false
	}
	installedPath := npmInstallPath(pkg.Scope, cwd, globalSettingsPath, name)
	current := installedPackageVersion(installedPath)
	if current == "" {
		return PiPackageUpdate{}, false
	}
	latest := latestNpmPackageVersion(ctx, cwd, npmCommand, name)
	if latest == "" || latest == current {
		return PiPackageUpdate{}, false
	}
	return PiPackageUpdate{
		Source:         pkg.Source,
		DisplayName:    name,
		Type:           "npm",
		Scope:          pkg.Scope,
		CurrentVersion: current,
		LatestVersion:  latest,
	}, true
}

func parseNpmPiPackageSource(source string) (name string, pinned bool, ok bool) {
	if !strings.HasPrefix(source, "npm:") {
		return "", false, false
	}
	spec := strings.TrimSpace(strings.TrimPrefix(source, "npm:"))
	match := npmPackageSpecPattern.FindStringSubmatch(spec)
	if match == nil || strings.TrimSpace(match[1]) == "" {
		return "", false, false
	}
	return strings.TrimSpace(match[1]), strings.TrimSpace(match[2]) != "", true
}

func npmInstallPath(scope string, cwd string, globalSettingsPath string, packageName string) string {
	if scope == "project" {
		return filepath.Join(cwd, ".pi", "npm", "node_modules", filepath.FromSlash(packageName))
	}
	return filepath.Join(filepath.Dir(globalSettingsPath), "npm", "node_modules", filepath.FromSlash(packageName))
}

func installedPackageVersion(packagePath string) string {
	content, err := os.ReadFile(filepath.Join(packagePath, "package.json"))
	if err != nil {
		return ""
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(content, &pkg); err != nil {
		return ""
	}
	return strings.TrimSpace(pkg.Version)
}

func latestNpmPackageVersion(ctx context.Context, cwd string, npmCommand []string, packageName string) string {
	command := "npm"
	argsPrefix := []string{}
	if len(npmCommand) > 0 {
		command = npmCommand[0]
		argsPrefix = npmCommand[1:]
	}
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	args := append(append([]string{}, argsPrefix...), "view", packageName, "version", "--json")
	cmd := exec.CommandContext(checkCtx, command, args...)
	cmd.Dir = cwd
	configureCommandProcessGroup(cmd)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	var version string
	if err := json.Unmarshal(out, &version); err == nil {
		return strings.TrimSpace(version)
	}
	return strings.Trim(strings.TrimSpace(string(out)), `"`)
}

func npmCommandFromSettings(settings map[string]any) []string {
	raw, ok := settings["npmCommand"].([]any)
	if !ok {
		return nil
	}
	command := make([]string, 0, len(raw))
	for _, part := range raw {
		text, ok := part.(string)
		if !ok || strings.TrimSpace(text) == "" {
			return nil
		}
		command = append(command, text)
	}
	return command
}
