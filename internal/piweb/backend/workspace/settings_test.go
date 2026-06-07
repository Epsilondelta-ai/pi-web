package workspace

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWorkspaceSettingsReadsMergesFiltersAndSaves(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", t.TempDir())

	paths, err := settingsPaths(root)
	if err != nil {
		t.Fatal(err)
	}
	writeJSON(t, paths.PiGlobal, map[string]any{"defaultThinkingLevel": "low", "readResponsesAloud": true})
	writeJSON(t, paths.PiWebGlobal, map[string]any{"readResponsesAloud": true, "defaultModel": "ignored"})
	writeJSON(t, paths.PiProject, map[string]any{"compaction": map[string]any{"enabled": false}})
	writeJSON(t, paths.PiWebProject, map[string]any{"voice": map[string]any{"language": "ja"}})

	settings, err := WorkspaceSettings(root)
	if err != nil {
		t.Fatal(err)
	}

	if settings.Global["defaultThinkingLevel"] != "low" {
		t.Fatalf("expected pi global setting, got %#v", settings.Global)
	}
	if settings.Global["readResponsesAloud"] != true {
		t.Fatalf("expected pi-web global setting, got %#v", settings.Global)
	}
	if _, ok := settings.Global["defaultModel"]; ok {
		t.Fatalf("pi-web file should filter pi setting: %#v", settings.Global)
	}
	if settings.Effective["defaultThinkingLevel"] != "low" {
		t.Fatalf("expected effective settings to merge global pi settings: %#v", settings.Effective)
	}
	voice, ok := settings.Effective["voice"].(map[string]any)
	if !ok || voice["language"] != "ja" {
		t.Fatalf("expected project pi-web voice setting, got %#v", settings.Effective["voice"])
	}
	compaction, ok := settings.Effective["compaction"].(map[string]any)
	if !ok || compaction["enabled"] != false {
		t.Fatalf("expected nested pi project setting, got %#v", settings.Effective["compaction"])
	}

	saved, err := SaveWorkspaceSettings(root, SettingsPatchRequest{
		Scope: "project",
		Settings: map[string]any{
			"defaultProvider":    "anthropic",
			"readResponsesAloud": nil,
			"voice":              map[string]any{"language": nil},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Project["defaultProvider"] != "anthropic" {
		t.Fatalf("expected saved pi project setting, got %#v", saved.Project)
	}
	if _, ok := saved.Project["readResponsesAloud"]; ok {
		t.Fatalf("expected pi-web setting deletion, got %#v", saved.Project)
	}
	if _, ok := saved.Project["voice"]; ok {
		t.Fatalf("expected empty voice container deletion, got %#v", saved.Project)
	}
}

func TestWorkspaceSettingsPropagatesReadAndWriteErrors(t *testing.T) {
	root := t.TempDir()
	home := t.TempDir()
	t.Setenv("HOME", home)

	paths, err := settingsPaths(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(paths.PiGlobal, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceSettings(root); err == nil {
		t.Fatal("expected pi global read error")
	}
	if err := os.Remove(paths.PiGlobal); err != nil {
		t.Fatal(err)
	}
	writeJSON(t, paths.PiGlobal, map[string]any{})
	if err := os.MkdirAll(paths.PiWebGlobal, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceSettings(root); err == nil {
		t.Fatal("expected pi-web global read error")
	}
	if err := os.Remove(paths.PiWebGlobal); err != nil {
		t.Fatal(err)
	}
	writeJSON(t, paths.PiWebGlobal, map[string]any{})
	if err := os.MkdirAll(paths.PiProject, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceSettings(root); err == nil {
		t.Fatal("expected pi project read error")
	}
	if err := os.Remove(paths.PiProject); err != nil {
		t.Fatal(err)
	}
	writeJSON(t, paths.PiProject, map[string]any{})
	if err := os.MkdirAll(paths.PiWebProject, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceSettings(root); err == nil {
		t.Fatal("expected pi-web project read error")
	}
}

func TestSaveWorkspaceSettingsPropagatesPatchWriteErrors(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", t.TempDir())
	paths, err := settingsPaths(root)
	if err != nil {
		t.Fatal(err)
	}
	writeJSON(t, paths.PiGlobal, map[string]any{})
	writeJSON(t, paths.PiWebGlobal, map[string]any{})
	writeJSON(t, paths.PiProject, map[string]any{})
	writeJSON(t, paths.PiWebProject, map[string]any{})

	if err := os.Remove(paths.PiProject); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(paths.PiProject, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveWorkspaceSettings(root, SettingsPatchRequest{Scope: "project", Settings: map[string]any{"defaultModel": "x"}}); err == nil {
		t.Fatal("expected pi project read error")
	}
	if err := os.Remove(paths.PiProject); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(paths.PiProject, "child"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveWorkspaceSettings(root, SettingsPatchRequest{Scope: "project", Settings: map[string]any{"defaultModel": "x"}}); err == nil {
		t.Fatal("expected pi project write error")
	}
	if err := os.RemoveAll(paths.PiProject); err != nil {
		t.Fatal(err)
	}
	writeJSON(t, paths.PiProject, map[string]any{})
	if err := os.Remove(paths.PiWebProject); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(paths.PiWebProject, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveWorkspaceSettings(root, SettingsPatchRequest{Scope: "project", Settings: map[string]any{"readResponsesAloud": true}}); err == nil {
		t.Fatal("expected pi-web project read error")
	}
	if err := os.Remove(paths.PiWebProject); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(paths.PiWebProject, "child"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveWorkspaceSettings(root, SettingsPatchRequest{Scope: "project", Settings: map[string]any{"readResponsesAloud": true}}); err == nil {
		t.Fatal("expected pi-web project write error")
	}
}

func TestSaveWorkspaceSettingsCoversWriteFailuresAndNestedCreation(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", t.TempDir())
	paths, err := settingsPaths(root)
	if err != nil {
		t.Fatal(err)
	}
	writeJSON(t, paths.PiGlobal, map[string]any{})
	writeJSON(t, paths.PiWebGlobal, map[string]any{})
	writeJSON(t, paths.PiProject, map[string]any{})
	writeJSON(t, paths.PiWebProject, map[string]any{})
	applyTarget := map[string]any{"existing": "scalar"}
	applySettingsPatch(applyTarget, map[string]any{"existing": map[string]any{"nested": true}})
	if applyTarget["existing"].(map[string]any)["nested"] != true {
		t.Fatalf("expected nested patch creation, got %#v", applyTarget)
	}
	if err := os.Chmod(paths.PiProject, 0o400); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveWorkspaceSettings(root, SettingsPatchRequest{Scope: "project", Settings: map[string]any{"defaultModel": "x"}}); err == nil {
		t.Fatal("expected pi project chmod write error")
	}
	if err := os.Chmod(paths.PiProject, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(paths.PiWebProject, 0o400); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveWorkspaceSettings(root, SettingsPatchRequest{Scope: "project", Settings: map[string]any{"readResponsesAloud": true}}); err == nil {
		t.Fatal("expected pi-web project chmod write error")
	}
	if err := os.Chmod(paths.PiWebProject, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestSettingsFileHelpersCoverEdgeCases(t *testing.T) {
	root := t.TempDir()
	blockingParent := filepath.Join(root, "parent-file")
	if err := os.WriteFile(blockingParent, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := WriteSettingsFile(filepath.Join(blockingParent, "settings.json"), map[string]any{}); err == nil {
		t.Fatal("expected mkdir parent error")
	}
	if err := WriteSettingsFile(root, map[string]any{}); err == nil {
		t.Fatal("expected open directory error")
	}
	nullFile := filepath.Join(root, "null.json")
	if err := os.WriteFile(nullFile, []byte("null"), 0o600); err != nil {
		t.Fatal(err)
	}
	read, err := ReadSettingsFile(nullFile)
	if err != nil || len(read) != 0 {
		t.Fatalf("expected nil JSON map to become empty map, got %#v err=%v", read, err)
	}
	missing, err := ReadSettingsFile(filepath.Join(root, "missing.json"))
	if err != nil || len(missing) != 0 {
		t.Fatalf("expected missing settings to read as empty, got %#v err=%v", missing, err)
	}
	t.Setenv("HOME", "")
	if _, err := settingsPaths(root); err == nil {
		t.Fatal("expected home lookup error")
	}
	if _, err := WorkspaceSettings(root); err == nil {
		t.Fatal("expected workspace settings home lookup error")
	}
	if _, err := SaveWorkspaceSettings(root, SettingsPatchRequest{Scope: "project"}); err == nil {
		t.Fatal("expected save settings home lookup error")
	}
}

func TestSettingsHelpersHandleErrorsAndClones(t *testing.T) {
	settings := map[string]any{"nested": map[string]any{"value": "original"}}
	clone := CloneSettingsMap(settings)
	cloneNested := clone["nested"].(map[string]any)
	cloneNested["value"] = "changed"
	if settings["nested"].(map[string]any)["value"] != "original" {
		t.Fatalf("expected clone isolation, got %#v", settings)
	}

	path, err := SettingsPathForScope(SettingsPaths{PiGlobal: "pi", PiWebGlobal: "web"}, "global")
	if err != nil || path != "web" {
		t.Fatalf("expected web global path, got path=%q err=%v", path, err)
	}
	path, err = SettingsPathForScope(SettingsPaths{PiProject: "pi-project"}, "project")
	if err != nil || path != "pi-project" {
		t.Fatalf("expected pi project fallback path, got path=%q err=%v", path, err)
	}
	if _, err := SettingsPathForScope(SettingsPaths{}, "bad"); err == nil {
		t.Fatal("expected invalid scope error")
	}
	if _, err := SaveWorkspaceSettings(t.TempDir(), SettingsPatchRequest{Scope: "bad"}); err == nil {
		t.Fatal("expected save invalid scope error")
	}

	empty := filepath.Join(t.TempDir(), "empty.json")
	if err := os.WriteFile(empty, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	read, err := ReadSettingsFile(empty)
	if err != nil || len(read) != 0 {
		t.Fatalf("expected empty settings, got %#v err=%v", read, err)
	}
	bad := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(bad, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadSettingsFile(bad); err == nil {
		t.Fatal("expected invalid json error")
	}
}

func writeJSON(t *testing.T, path string, value map[string]any) {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}
