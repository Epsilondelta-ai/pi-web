package backend

import (
	"encoding/json"
	"time"

	backendsessions "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/sessions"
)

const (
	SessionKindSubagent = backendsessions.SessionKindSubagent
	SessionKindTeam     = backendsessions.SessionKindTeam
)

type ParsedSession = backendsessions.ParsedSession
type SessionMessagePage = backendsessions.SessionMessagePage
type SessionHeader = backendsessions.SessionHeader

func DefaultPiSessionDir() string { return backendsessions.DefaultPiSessionDir() }
func DefaultPiTeamsDir() string   { return backendsessions.DefaultPiTeamsDir() }
func LoadPiSessions(sessionDir string) ([]ParsedSession, error) {
	return backendsessions.LoadPiSessions(sessionDir)
}
func LoadPiSessionSummaries(sessionDir string) ([]ParsedSession, error) {
	return backendsessions.LoadPiSessionSummaries(sessionDir)
}
func CreatePiSessionFile(cwd string) (Session, string, error) {
	return backendsessions.CreatePiSessionFile(cwd)
}
func ParsePiSessionFile(path string) (ParsedSession, error) {
	return backendsessions.ParsePiSessionFile(path)
}
func ParsePiSessionLine(line string) (Message, bool) { return backendsessions.ParsePiSessionLine(line) }
func ParsePiSessionLineMessages(line string) []Message {
	return backendsessions.ParsePiSessionLineMessages(line)
}
func ParsePiSessionMessagePage(path string, limit int, before string) (SessionMessagePage, error) {
	return backendsessions.ParsePiSessionMessagePage(path, limit, before)
}
func withTeamChildSessions(sessions []ParsedSession) []ParsedSession {
	return backendsessions.WithTeamChildSessions(sessions)
}
func parsedWorkspaceSessionDir(sessionRoot, sessionFile string) string {
	return backendsessions.ParsedWorkspaceSessionDir(sessionRoot, sessionFile)
}
func piSessionDirForCWD(cwd string) string   { return backendsessions.PiSessionDirForCWD(cwd) }
func workspaceIDFromPath(path string) string { return backendsessions.WorkspaceIDFromPath(path) }
func trimTitle(value string) string          { return backendsessions.TrimTitle(value) }
func readSessionHeader(path string) (SessionHeader, error) {
	return backendsessions.ReadSessionHeader(path)
}
func cleanSessionPath(path string) string { return backendsessions.CleanSessionPath(path) }
func convertAgentMessages(raw json.RawMessage) []Message {
	return backendsessions.ConvertAgentMessages(raw)
}
func normalizeSessionMessageLimit(limit int) int { return backendsessions.NormalizeMessageLimit(limit) }
func canAutoNameTitle(title string) bool         { return backendsessions.CanAutoNameTitle(title) }
func removeTeamSessionDir(sessionID string) error {
	return backendsessions.RemoveTeamSessionDir(sessionID)
}
func sessionSourcesModTime(paths ...string) time.Time {
	return backendsessions.SourcesModTime(paths...)
}
func createSessionID() string { return backendsessions.CreateSessionID() }
func sessionCreatedAfter(left, right ParsedSession) bool {
	return backendsessions.SessionCreatedAfter(left, right)
}
func relTime(t time.Time) string { return backendsessions.RelTime(t) }
func imageDataURL(data string, mimeType string) string {
	return backendsessions.ImageDataURL(data, mimeType)
}
func contentText(raw json.RawMessage) string     { return backendsessions.ContentText(raw) }
func userMessages(raw json.RawMessage) []Message { return backendsessions.UserMessages(raw) }
