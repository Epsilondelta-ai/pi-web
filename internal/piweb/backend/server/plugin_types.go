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
