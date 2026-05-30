package backend

import backendworkspace "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/workspace"

type WorkspaceSettingsResponse = backendworkspace.WorkspaceSettingsResponse
type SettingsPaths = backendworkspace.SettingsPaths
type SettingsPatchRequest = backendworkspace.SettingsPatchRequest

func WorkspaceSettings(root string) (WorkspaceSettingsResponse, error) {
	return backendworkspace.WorkspaceSettings(root)
}

func SaveWorkspaceSettings(root string, req SettingsPatchRequest) (WorkspaceSettingsResponse, error) {
	return backendworkspace.SaveWorkspaceSettings(root, req)
}

func settingsPathForScope(paths SettingsPaths, scope string) (string, error) {
	return backendworkspace.SettingsPathForScope(paths, scope)
}

func readSettingsFile(path string) (map[string]any, error) {
	return backendworkspace.ReadSettingsFile(path)
}

func writeSettingsFile(path string, settings map[string]any) error {
	return backendworkspace.WriteSettingsFile(path, settings)
}

func cloneSettingsMap(settings map[string]any) map[string]any {
	return backendworkspace.CloneSettingsMap(settings)
}
