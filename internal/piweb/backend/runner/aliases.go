package runner

import (
	backendsessions "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/sessions"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
)

type Session = shared.Session
type Message = shared.Message
type PromptAttachment = shared.PromptAttachment
type Event = shared.Event

type EventSink interface {
	Publish(sessionID, eventType string, payload any) Event
}
type SessionMessageStore interface {
	SessionRuntime(sessionID string) (sessionFile, cwd string, ok bool)
	AppendMessage(sessionID string, msg Message) error
	Session(sessionID string) (Session, []Message, error)
}

func ParsePiSessionLineMessages(line string) []Message {
	return backendsessions.ParsePiSessionLineMessages(line)
}
