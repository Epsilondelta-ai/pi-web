package server

import (
	"os"
	"path/filepath"
	"strings"
)

func cleanPluginID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" || strings.Contains(id, "/") || strings.Contains(id, "\\") || strings.Contains(id, "..") {
		return ""
	}
	return id
}

func pluginRoot() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(".", ".pi-web", "plugins")
	}
	return filepath.Join(home, ".pi-web", "plugins")
}

func pluginMetadataDir() string {
	return filepath.Join(pluginRoot(), ".metadata")
}

func pluginMetadataPath(id string) string {
	return filepath.Join(pluginMetadataDir(), id+".json")
}
