package piweb

import (
	"context"
	"io"
	"net/http"
	"time"

	"github.com/Epsilondelta-ai/pi-web/internal/piweb/eventbus"
)

type Broker struct{ inner *eventbus.Broker }

func NewBroker() *Broker { return &Broker{inner: eventbus.NewBroker()} }

func (b *Broker) SetBuffer(buffer int)                 { b.inner.SetBuffer(buffer) }
func (b *Broker) SetHistorySize(size int)              { b.inner.SetHistorySize(size) }
func (b *Broker) SetHeartbeat(heartbeat time.Duration) { b.inner.SetHeartbeat(heartbeat) }

func (b *Broker) Subscribe(sessionID string) (<-chan Event, func()) {
	return b.inner.Subscribe(sessionID)
}
func (b *Broker) Publish(sessionID, eventType string, payload any) Event {
	return b.inner.Publish(sessionID, eventType, payload)
}
func (b *Broker) Replay(sessionID string, after uint64) []Event {
	return b.inner.Replay(sessionID, after)
}
func (b *Broker) ServeSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	b.inner.ServeSession(w, r, sessionID)
}
func WriteSSE(w io.Writer, event Event) error { return eventbus.WriteSSE(w, event) }

func shouldReplayHistory(r *http.Request, after uint64) bool {
	return eventbus.ShouldReplayHistory(r, after)
}

func (b *Broker) PublishMockPrompt(ctx context.Context, store SessionMessageStore, sessionID, text string) {
	user := Message{Kind: "user", Text: text}
	_ = store.AppendMessage(sessionID, user)
	b.Publish(sessionID, "session.message", user)

	steps := []struct {
		delay    time.Duration
		typeName string
		payload  any
	}{
		{100 * time.Millisecond, "session.status", map[string]string{"status": "thinking"}},
		{150 * time.Millisecond, "tool.started", Message{Kind: "tool", Tool: "bash", Args: "$ pwd", Status: "running"}},
		{150 * time.Millisecond, "tool.output", map[string]string{"tool": "bash", "chunk": "/mock/workspace"}},
		{150 * time.Millisecond, "tool.finished", Message{Kind: "tool", Tool: "bash", Args: "$ pwd", Status: "ok", DurationMs: 42, ResultMeta: "done", Body: "/mock/workspace"}},
		{150 * time.Millisecond, "session.message", Message{Kind: "pi", Text: "Mock backend received your prompt and streamed this response over SSE."}},
		{100 * time.Millisecond, "session.status", map[string]string{"status": "idle"}},
	}
	for _, step := range steps {
		select {
		case <-ctx.Done():
			return
		case <-time.After(step.delay):
			if msg, ok := step.payload.(Message); ok && step.typeName == "session.message" {
				_ = store.AppendMessage(sessionID, msg)
			}
			b.Publish(sessionID, step.typeName, step.payload)
		}
	}
}
