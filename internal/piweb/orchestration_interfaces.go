package piweb

// EventSink is the event publication boundary consumed by long-running process orchestration.
type EventSink interface {
	Publish(sessionID, eventType string, payload any) Event
}

// SessionMessageStore is the narrow session persistence boundary consumed by Runner.
type SessionMessageStore interface {
	SessionRuntime(sessionID string) (sessionFile, cwd string, ok bool)
	AppendMessage(sessionID string, msg Message) error
	Session(sessionID string) (Session, []Message, error)
}
