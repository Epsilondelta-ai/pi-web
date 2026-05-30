package notifications

import (
	"strings"

	backendsessions "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/sessions"
	backendworkspace "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/workspace"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
)

type Session = shared.Session
type Message = shared.Message
type WorkspaceSettingsResponse = backendworkspace.WorkspaceSettingsResponse

const (
	SessionKindSubagent = backendsessions.SessionKindSubagent
	SessionKindTeam     = backendsessions.SessionKindTeam
)

func WorkspaceSettings(root string) (WorkspaceSettingsResponse, error) {
	return backendworkspace.WorkspaceSettings(root)
}
func readSessionHeader(path string) (backendsessions.SessionHeader, error) {
	return backendsessions.ReadSessionHeader(path)
}
func cleanSessionPath(path string) string { return backendsessions.CleanSessionPath(path) }
func DefaultPiTeamsDir() string           { return backendsessions.DefaultPiTeamsDir() }
func containsFallbackChoice(text string) bool {
	return strings.Contains(text, "\"type\":\"piweb_choice\"") || strings.Contains(text, "\"type\": \"piweb_choice\"")
}
