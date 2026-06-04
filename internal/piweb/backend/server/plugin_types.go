package server

import "encoding/json"

type pluginManifest struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Version  string `json:"version"`
	Entry    string `json:"entry"`
	Backend  string `json:"backend"`
	Enabled  bool   `json:"enabled"`
	Path     string `json:"path"`
	Source   string `json:"source"`
	URL      string `json:"url"`
	CacheKey string `json:"cacheKey"`
}

type pluginUpdateStatus struct {
	ID              string `json:"id"`
	Source          string `json:"source"`
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion,omitempty"`
	UpdateAvailable bool   `json:"updateAvailable"`
	Checked         bool   `json:"checked"`
	Error           string `json:"error,omitempty"`
}

type pluginInstallMetadata struct {
	Source  string `json:"source"`
	URL     string `json:"url"`
	Path    string `json:"path"`
	Enabled *bool  `json:"enabled,omitempty"`
}

type pluginInstallRequest struct {
	Source string `json:"source"`
	Path   string `json:"path"`
	URL    string `json:"url"`
}

type pluginBackendRequest struct {
	WorkspaceID string          `json:"workspaceId"`
	Data        json.RawMessage `json:"data"`
}
