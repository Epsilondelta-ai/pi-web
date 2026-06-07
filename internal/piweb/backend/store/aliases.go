package store

import (
	"encoding/json"
	"time"

	backendsessions "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/sessions"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
)

type Workspace = shared.Workspace
type Session = shared.Session
type Message = shared.Message
type FileNode = shared.FileNode
type ParsedSession = backendsessions.ParsedSession
type SessionMessagePage = backendsessions.SessionMessagePage
type PromptAttachment = shared.PromptAttachment

const (
	SessionKindSubagent = backendsessions.SessionKindSubagent
	SessionKindTeam     = backendsessions.SessionKindTeam
)

func DefaultPiSessionDir() string { return backendsessions.DefaultPiSessionDir() }
func DefaultPiTeamsDir() string   { return backendsessions.DefaultPiTeamsDir() }
func LoadPiSessions(sessionDir string) ([]ParsedSession, error) {
	return backendsessions.LoadPiSessions(sessionDir)
}
func LoadPiSessionSummaries(sessionDir string) ([]ParsedSession, error) {
	return backendsessions.LoadPiSessionSummaries(sessionDir)
}
func ParsePiSessionFile(path string) (ParsedSession, error) {
	return backendsessions.ParsePiSessionFile(path)
}
func ParsePiSessionMessagePage(path string, limit int, before string) (SessionMessagePage, error) {
	return backendsessions.ParsePiSessionMessagePage(path, limit, before)
}
func CreatePiSessionFile(cwd string) (Session, string, error) {
	return backendsessions.CreatePiSessionFile(cwd)
}
func piSessionDirForCWD(cwd string) string { return backendsessions.PiSessionDirForCWD(cwd) }
func withTeamChildSessions(sessions []ParsedSession) []ParsedSession {
	return backendsessions.WithTeamChildSessions(sessions)
}
func workspaceIDFromPath(path string) string { return backendsessions.WorkspaceIDFromPath(path) }
func parsedWorkspaceSessionDir(sessionRoot, sessionFile string) string {
	return backendsessions.ParsedWorkspaceSessionDir(sessionRoot, sessionFile)
}
func sessionSourcesModTime(paths ...string) time.Time {
	return backendsessions.SourcesModTime(paths...)
}
func removeTeamSessionDir(sessionID string) error {
	return backendsessions.RemoveTeamSessionDir(sessionID)
}
func createSessionID() string { return backendsessions.CreateSessionID() }
func imageDataURL(data string, mimeType string) string {
	return backendsessions.ImageDataURL(data, mimeType)
}
func userMessages(raw json.RawMessage) []Message { return backendsessions.UserMessages(raw) }
