package sessions

import (
	"encoding/json"
	"time"
)

func WithTeamChildSessions(sessions []ParsedSession) []ParsedSession {
	return withTeamChildSessions(sessions)
}
func ParsedWorkspaceSessionDir(sessionRoot, sessionFile string) string {
	return parsedWorkspaceSessionDir(sessionRoot, sessionFile)
}
func PiSessionDirForCWD(cwd string) string                 { return piSessionDirForCWD(cwd) }
func WorkspaceIDFromPath(path string) string               { return workspaceIDFromPath(path) }
func TrimTitle(value string) string                        { return trimTitle(value) }
func ReadSessionHeader(path string) (SessionHeader, error) { return readSessionHeader(path) }
func CleanSessionPath(path string) string                  { return cleanSessionPath(path) }
func ConvertAgentMessages(raw json.RawMessage) []Message   { return convertAgentMessages(raw) }
func NormalizeMessageLimit(limit int) int                  { return normalizeSessionMessageLimit(limit) }
func CanAutoNameTitle(title string) bool                   { return canAutoNameTitle(title) }
func RemoveTeamSessionDir(sessionID string) error          { return removeTeamSessionDir(sessionID) }
func SourcesModTime(paths ...string) time.Time             { return sessionSourcesModTime(paths...) }
func CreateSessionID() string                              { return createSessionID() }
func SessionCreatedAfter(left, right ParsedSession) bool   { return sessionCreatedAfter(left, right) }
func RelTime(t time.Time) string                           { return relTime(t) }
func ImageDataURL(data string, mimeType string) string     { return imageDataURL(data, mimeType) }
func ContentText(raw json.RawMessage) string               { return contentText(raw) }
func UserMessages(raw json.RawMessage) []Message           { return userMessages(raw) }
