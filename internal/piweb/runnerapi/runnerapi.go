package runnerapi

import "github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"

type EventSink interface {
	Publish(sessionID, eventType string, payload any) shared.Event
}

type Runner interface {
	Steer(sessionID string, text string, images []shared.PromptAttachment) error
	Cancel(sessionID string) bool
	IsRunning(sessionID string) bool
}
