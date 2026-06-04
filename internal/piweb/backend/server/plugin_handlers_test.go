package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPluginInstallListAssetAndUninstall(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	source := filepath.Join(t.TempDir(), "toast-plus")
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := `{"id":"toast-plus","name":"Toast Plus","version":"0.1.0","entry":"index.js"}`
	if err := os.WriteFile(filepath.Join(source, "plugin.json"), []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "index.js"), []byte("export default () => {};"), 0o600); err != nil {
		t.Fatal(err)
	}

	server := NewServer(Config{}, NewMockStore(), NewBroker())
	install := httptest.NewRequest(http.MethodPost, "/api/plugins/install", strings.NewReader(`{"path":"`+source+`"}`))
	installRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(installRes, install)
	if installRes.Code != http.StatusOK {
		t.Fatalf("install status = %d body = %s", installRes.Code, installRes.Body.String())
	}

	list := httptest.NewRequest(http.MethodGet, "/api/plugins", nil)
	listRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(listRes, list)
	if listRes.Code != http.StatusOK {
		t.Fatalf("list status = %d", listRes.Code)
	}
	var body struct {
		Plugins []pluginManifest `json:"plugins"`
	}
	if err := json.Unmarshal(listRes.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Plugins) != 1 || body.Plugins[0].ID != "toast-plus" || !body.Plugins[0].Enabled {
		t.Fatalf("plugins = %#v", body.Plugins)
	}

	asset := httptest.NewRequest(http.MethodGet, "/api/plugins/toast-plus/assets/index.js", nil)
	assetRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(assetRes, asset)
	if assetRes.Code != http.StatusOK || !strings.Contains(assetRes.Body.String(), "export default") {
		t.Fatalf("asset status = %d body = %s", assetRes.Code, assetRes.Body.String())
	}

	disable := httptest.NewRequest(http.MethodPost, "/api/plugins/toast-plus/disable", nil)
	disableRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(disableRes, disable)
	if disableRes.Code != http.StatusOK {
		t.Fatalf("disable status = %d", disableRes.Code)
	}
	plugins, err := listPluginManifests()
	if err != nil || len(plugins) != 1 || plugins[0].Enabled {
		t.Fatalf("disabled plugins = %#v err = %v", plugins, err)
	}
	if _, err := os.Stat(filepath.Join(source, ".disabled")); !os.IsNotExist(err) {
		t.Fatalf("disable leaked into local plugin source: %v", err)
	}
	if _, err := os.Stat(pluginMetadataPath("toast-plus")); err != nil {
		t.Fatalf("disable metadata missing: %v", err)
	}
	enable := httptest.NewRequest(http.MethodPost, "/api/plugins/toast-plus/enable", nil)
	enableRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(enableRes, enable)
	if enableRes.Code != http.StatusOK {
		t.Fatalf("enable status = %d", enableRes.Code)
	}

	remove := httptest.NewRequest(http.MethodDelete, "/api/plugins/toast-plus", nil)
	removeRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(removeRes, remove)
	if removeRes.Code != http.StatusOK {
		t.Fatalf("remove status = %d", removeRes.Code)
	}
	if _, err := os.Stat(filepath.Join(home, ".pi-web", "plugins", "toast-plus")); !os.IsNotExist(err) {
		t.Fatalf("plugin target still exists: %v", err)
	}
}

func TestPluginInstallFromGitHubURL(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	source := filepath.Join(t.TempDir(), "repo")
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "plugin.json"), []byte(`{"id":"github-plugin","version":"1.0.0","entry":"index.js"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "index.js"), []byte("export default () => {};"), 0o600); err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(t.TempDir(), "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	gitScript := "#!/bin/sh\nset -eu\ndest=\"$5\"\nmkdir -p \"$dest\"\ncp -R \"$PI_WEB_FAKE_GIT_SOURCE\"/. \"$dest\"\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(gitScript), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("PI_WEB_FAKE_GIT_SOURCE", source)

	server := NewServer(Config{}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodPost, "/api/plugins/install", strings.NewReader(`{"source":"github","url":"owner/repo"}`))
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", res.Code, res.Body.String())
	}
	installedPath := filepath.Join(home, ".pi-web", "plugins", "github-plugin", "index.js")
	if data, err := os.ReadFile(installedPath); err != nil || !strings.Contains(string(data), "export default") {
		t.Fatalf("installed data = %q err = %v", string(data), err)
	}
	plugins, err := listPluginManifests()
	if err != nil || len(plugins) != 1 || plugins[0].Source != "github" || plugins[0].URL != "https://github.com/owner/repo.git" || plugins[0].CacheKey == "" {
		t.Fatalf("github plugin metadata = %#v err = %v", plugins, err)
	}
	if err := os.WriteFile(filepath.Join(source, "plugin.json"), []byte(`{"id":"github-plugin","version":"1.1.0","entry":"index.js"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	updates := httptest.NewRequest(http.MethodGet, "/api/plugins/updates", nil)
	updatesRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(updatesRes, updates)
	if updatesRes.Code != http.StatusOK {
		t.Fatalf("updates status = %d body = %s", updatesRes.Code, updatesRes.Body.String())
	}
	var updatesBody struct {
		Plugins []pluginUpdateStatus `json:"plugins"`
	}
	if err := json.Unmarshal(updatesRes.Body.Bytes(), &updatesBody); err != nil {
		t.Fatal(err)
	}
	if len(updatesBody.Plugins) != 1 || !updatesBody.Plugins[0].UpdateAvailable || updatesBody.Plugins[0].LatestVersion != "1.1.0" {
		t.Fatalf("updates = %#v", updatesBody.Plugins)
	}
	if err := os.WriteFile(filepath.Join(source, "index.js"), []byte("export default () => 'updated';"), 0o600); err != nil {
		t.Fatal(err)
	}
	update := httptest.NewRequest(http.MethodPost, "/api/plugins/github-plugin/update", nil)
	updateRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(updateRes, update)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("update status = %d body = %s", updateRes.Code, updateRes.Body.String())
	}
	if data, err := os.ReadFile(installedPath); err != nil || !strings.Contains(string(data), "updated") {
		t.Fatalf("updated data = %q err = %v", string(data), err)
	}
	reload := httptest.NewRequest(http.MethodPost, "/api/plugins/reload", nil)
	reloadRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(reloadRes, reload)
	if reloadRes.Code != http.StatusOK {
		t.Fatalf("reload status = %d body = %s", reloadRes.Code, reloadRes.Body.String())
	}
	if data, err := os.ReadFile(installedPath); err != nil || !strings.Contains(string(data), "updated") {
		t.Fatalf("reloaded data = %q err = %v", string(data), err)
	}
}

func TestPluginInstallRejectsInvalidManifest(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	source := filepath.Join(t.TempDir(), "bad")
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "plugin.json"), []byte(`{"id":"../bad","entry":"index.js"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodPost, "/api/plugins/install", strings.NewReader(`{"path":"`+source+`"}`))
	res := httptest.NewRecorder()
	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", res.Code, res.Body.String())
	}
}
