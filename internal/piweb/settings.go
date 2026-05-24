package piweb

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
	Global  string `json:"global"`
	Project string `json:"project"`
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
	global, err := readSettingsFile(paths.Global)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	project, err := readSettingsFile(paths.Project)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	effective := defaultSettings()
	mergeSettings(effective, global)
	mergeSettings(effective, project)
	return WorkspaceSettingsResponse{Global: global, Project: project, Effective: effective, Paths: paths}, nil
}

func SaveWorkspaceSettings(root string, req SettingsPatchRequest) (WorkspaceSettingsResponse, error) {
	paths, err := settingsPaths(root)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	path, err := settingsPathForScope(paths, req.Scope)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	current, err := readSettingsFile(path)
	if err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	applySettingsPatch(current, req.Settings)
	if err := writeSettingsFile(path, current); err != nil {
		return WorkspaceSettingsResponse{}, err
	}
	return WorkspaceSettings(root)
}

func settingsPaths(root string) (SettingsPaths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return SettingsPaths{}, err
	}
	return SettingsPaths{
		Global:  filepath.Join(home, ".pi", "agent", "settings.json"),
		Project: filepath.Join(root, ".pi", "settings.json"),
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

func settingsPathForScope(paths SettingsPaths, scope string) (string, error) {
	switch scope {
	case "global":
		return paths.Global, nil
	case "project":
		return paths.Project, nil
	default:
		return "", errors.New("settings scope must be global or project")
	}
}

func readSettingsFile(path string) (map[string]any, error) {
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

func writeSettingsFile(path string, settings map[string]any) error {
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

func cloneSettingsMap(settings map[string]any) map[string]any {
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
	return cloneSettingsMap(settings)
}
