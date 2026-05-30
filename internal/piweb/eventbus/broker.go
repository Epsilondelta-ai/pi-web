package eventbus

import (
	"encoding/json"
	"fmt"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
	"io"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type Broker struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan shared.Event]struct{}
	nextID      atomic.Uint64
	buffer      int
	heartbeat   time.Duration
	history     map[string][]shared.Event
	historySize int
}

func NewBroker() *Broker {
	return &Broker{
		subscribers: map[string]map[chan shared.Event]struct{}{},
		history:     map[string][]shared.Event{},
		buffer:      32,
		heartbeat:   15 * time.Second,
		historySize: 256,
	}
}

func (b *Broker) SetBuffer(buffer int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buffer = buffer
}

func (b *Broker) SetHistorySize(size int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.historySize = size
}

func (b *Broker) SetHeartbeat(heartbeat time.Duration) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.heartbeat = heartbeat
}

func (b *Broker) Subscribe(sessionID string) (<-chan shared.Event, func()) {
	eventChannel := make(chan shared.Event, b.buffer)
	b.mu.Lock()
	if b.subscribers[sessionID] == nil {
		b.subscribers[sessionID] = map[chan shared.Event]struct{}{}
	}
	b.subscribers[sessionID][eventChannel] = struct{}{}
	b.mu.Unlock()

	unsubscribe := func() {
		b.mu.Lock()
		if subscribers := b.subscribers[sessionID]; subscribers != nil {
			if _, ok := subscribers[eventChannel]; ok {
				delete(subscribers, eventChannel)
				close(eventChannel)
			}
			if len(subscribers) == 0 {
				delete(b.subscribers, sessionID)
			}
		}
		b.mu.Unlock()
	}
	return eventChannel, unsubscribe
}

func (b *Broker) Publish(sessionID, eventType string, payload any) shared.Event {
	event := shared.Event{
		ID:        b.nextID.Add(1),
		Type:      eventType,
		SessionID: sessionID,
		Payload:   shared.RedactPayload(payload),
		At:        time.Now().UTC(),
	}
	b.mu.Lock()
	b.history[sessionID] = append(b.history[sessionID], event)
	if len(b.history[sessionID]) > b.historySize {
		b.history[sessionID] = b.history[sessionID][len(b.history[sessionID])-b.historySize:]
	}
	var subscribers []chan shared.Event
	for eventChannel := range b.subscribers[sessionID] {
		subscribers = append(subscribers, eventChannel)
	}
	b.mu.Unlock()
	for _, eventChannel := range subscribers {
		select {
		case eventChannel <- event:
		default:
		}
	}
	return event
}

func (b *Broker) Replay(sessionID string, after uint64) []shared.Event {
	b.mu.RLock()
	defer b.mu.RUnlock()
	var replay []shared.Event
	for _, event := range b.history[sessionID] {
		if event.ID > after {
			replay = append(replay, event)
		}
	}
	return replay
}

func (b *Broker) ServeSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	var after uint64
	if value := r.Header.Get("Last-shared.Event-ID"); value != "" {
		after, _ = strconv.ParseUint(value, 10, 64)
	}
	if shouldReplayHistory(r, after) {
		for _, event := range b.Replay(sessionID, after) {
			if err := WriteSSE(w, event); err != nil {
				return
			}
		}
		flusher.Flush()
	}

	events, unsubscribe := b.Subscribe(sessionID)
	defer unsubscribe()
	ticker := time.NewTicker(b.heartbeat)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := WriteSSE(w, event); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			event := shared.Event{
				ID:        b.nextID.Add(1),
				Type:      "heartbeat",
				SessionID: sessionID,
				Payload:   map[string]string{"status": "ok"},
				At:        time.Now().UTC(),
			}
			if err := WriteSSE(w, event); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func ShouldReplayHistory(r *http.Request, after uint64) bool {
	return after > 0 || r.URL.Query().Get("replay") != "false"
}

func shouldReplayHistory(r *http.Request, after uint64) bool {
	return ShouldReplayHistory(r, after)
}

func WriteSSE(w io.Writer, event shared.Event) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\n", event.Type); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "id: %d\n", event.ID); err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "data: %s\n\n", data)
	return err
}
