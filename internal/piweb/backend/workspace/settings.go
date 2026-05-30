package workspace

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type WorkspaceSettingsResponse struct {
	Global    map[string]any `json:"global"`
	Project   map[string]any `json:"project"`
	Effective map[string]any `json:"effective"`
	Paths     SettingsPaths  `json:"paths"`
}

type SettingsPaths struct {
	Global       string `json:"global"`
	Project      string `json:"project"`
	PiGlobal     string `json:"piGlobal"`
	PiProject    string `json:"piProject"`
	PiWebGlobal  string `json:"piWebGlobal"`
	PiWebProject string `json:"piWebProject"`
}

type SettingsPatchRequest struct {
	Scope    string         `json:"scope"`
	Settings map[string]any `json:"settings"`
}

func WorkspaceSettings(root string) (WorkspaceSettingsResponse, error) {
	paths, err := settingsPaths(root)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	piGlobal, err := ReadSettingsFile(paths.PiGlobal)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	webGlobal, err := ReadSettingsFile(paths.PiWebGlobal)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	piProject, err := ReadSettingsFile(paths.PiProject)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	webProject, err := ReadSettingsFile(paths.PiWebProject)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	piGlobal = filterSettingsByKind(piGlobal, false)
	webGlobal = filterSettingsByKind(webGlobal, true)
	piProject = filterSettingsByKind(piProject, false)
	webProject = filterSettingsByKind(webProject, true)
	global := mergeSettingsMaps(piGlobal, webGlobal)
	project := mergeSettingsMaps(piProject, webProject)
	effective := defaultSettings()
	mergeSettings(effective, piGlobal)
	mergeSettings(effective, webGlobal)
	mergeSettings(effective, piProject)
	mergeSettings(effective, webProject)
	return WorkspaceSettingsResponse{Global: global, Project: project, Effective: effective, Paths: paths}, nil
}

func SaveWorkspaceSettings(root string, req SettingsPatchRequest) (WorkspaceSettingsResponse, error) {
	paths, err := settingsPaths(root)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	piPath, webPath, err := settingsPathsForScope(paths, req.Scope)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	piPatch, webPatch := splitSettingsPatch(req.Settings)
	if len(piPatch) > 0 {
		current, err := ReadSettingsFile(piPath)
		if err != nil {
			return WorkspaceSettingsResponse{}, err
		}
		applySettingsPatch(current, piPatch)
		if err := WriteSettingsFile(piPath, current); err != nil {
			return WorkspaceSettingsResponse{}, err
		}
	}
	if len(webPatch) > 0 {
		current, err := ReadSettingsFile(webPath)
		if err != nil {
			return WorkspaceSettingsResponse{}, err
		}
		applySettingsPatch(current, webPatch)
		if err := WriteSettingsFile(webPath, current); err != nil {
			return WorkspaceSettingsResponse{}, err
		}
	}
	return WorkspaceSettings(root)
}

func settingsPaths(root string) (SettingsPaths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return SettingsPaths{}, err
	}
	piGlobal := filepath.Join(home, ".pi", "agent", "settings.json")
	piProject := filepath.Join(root, ".pi", "settings.json")
	webGlobal := filepath.Join(home, ".pi", "web", "settings.json")
	webProject := filepath.Join(root, ".pi", "pi-web.json")
	return SettingsPaths{
		Global:       webGlobal,
		Project:      webProject,
		PiGlobal:     piGlobal,
		PiProject:    piProject,
		PiWebGlobal:  webGlobal,
		PiWebProject: webProject,
	}, nil
}

func defaultSettings() map[string]any {
	return map[string]any{
		"theme":                  "dark",
		"defaultThinkingLevel":   "off",
		"hideThinkingBlock":      false,
		"quietStartup":           false,
		"collapseChangelog":      false,
		"enableInstallTelemetry": true,
		"doubleEscapeAction":     "tree",
		"treeFilterMode":         "default",
		"editorPaddingX":         0,
		"autocompleteMaxVisible": 5,
		"showHardwareCursor":     false,
		"enableSkillCommands":    true,
		"steeringMode":           "one-at-a-time",
		"followUpMode":           "one-at-a-time",
		"transport":              "auto",
		"compaction": map[string]any{
			"enabled": true,
		},
		"terminal": map[string]any{
			"showImages":           true,
			"imageWidthCells":      60,
			"clearOnShrink":        false,
			"showTerminalProgress": false,
		},
		"images": map[string]any{
			"autoResize":  true,
			"blockImages": false,
		},
		"warnings": map[string]any{
			"anthropicExtraUsage": true,
		},
		"remoteNotifications": map[string]any{
			"discord": map[string]any{
				"enabled": false,
			},
			"telegram": map[string]any{
				"enabled": false,
			},
		},
	}
}

func SettingsPathForScope(paths SettingsPaths, scope string) (string, error) {
	piPath, webPath, err := settingsPathsForScope(paths, scope)
	if err != nil {
		return "", err
	}
	if webPath != "" {
		return webPath, nil
	}
	return piPath, nil
}

func settingsPathsForScope(paths SettingsPaths, scope string) (string, string, error) {
	switch scope {
	case "global":
		return paths.PiGlobal, paths.PiWebGlobal, nil
	case "project":
		return paths.PiProject, paths.PiWebProject, nil
	default:
		return "", "", errors.New("settings scope must be global or project")
	}
}

func splitSettingsPatch(settings map[string]any) (map[string]any, map[string]any) {
	piSettings := map[string]any{}
	webSettings := map[string]any{}
	for key, value := range settings {
		if isPiWebSetting(key) {
			webSettings[key] = cloneSettingValue(value)
		} else {
			piSettings[key] = cloneSettingValue(value)
		}
	}
	return piSettings, webSettings
}

func filterSettingsByKind(settings map[string]any, piWeb bool) map[string]any {
	filtered := map[string]any{}
	for key, value := range settings {
		if isPiWebSetting(key) == piWeb {
			filtered[key] = cloneSettingValue(value)
		}
	}
	return filtered
}

func isPiWebSetting(key string) bool {
	switch key {
	case "readResponsesAloud", "voice", "enableSpeechInput", "speechInput", "remoteNotifications", "status":
		return true
	default:
		return false
	}
}

func ReadSettingsFile(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return map[string]any{}, nil
	}
	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, err
	}
	if settings == nil {
		settings = map[string]any{}
	}
	return settings, nil
}

func WriteSettingsFile(path string, settings map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(settings)
}

func mergeSettingsMaps(settings ...map[string]any) map[string]any {
	merged := map[string]any{}
	for _, setting := range settings {
		mergeSettings(merged, setting)
	}
	return merged
}

func mergeSettings(dst, src map[string]any) {
	for key, value := range src {
		srcMap, srcOK := value.(map[string]any)
		dstMap, dstOK := dst[key].(map[string]any)
		if srcOK && dstOK {
			mergeSettings(dstMap, srcMap)
			continue
		}
		dst[key] = cloneSettingValue(value)
	}
}

func applySettingsPatch(dst, patch map[string]any) {
	for key, value := range patch {
		if value == nil {
			delete(dst, key)
			continue
		}
		patchMap, patchOK := value.(map[string]any)
		dstMap, dstOK := dst[key].(map[string]any)
		if patchOK {
			if !dstOK {
				dstMap = map[string]any{}
			}
			applySettingsPatch(dstMap, patchMap)
			if len(dstMap) == 0 {
				delete(dst, key)
			} else {
				dst[key] = dstMap
			}
			continue
		}
		dst[key] = cloneSettingValue(value)
	}
}

func CloneSettingsMap(settings map[string]any) map[string]any {
	clone := map[string]any{}
	for key, value := range settings {
		clone[key] = cloneSettingValue(value)
	}
	return clone
}

func cloneSettingValue(value any) any {
	settings, ok := value.(map[string]any)
	if !ok {
		return value
	}
	return CloneSettingsMap(settings)
}
