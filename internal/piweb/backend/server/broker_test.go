package server

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestWriteSSE(t *testing.T) {
	var b strings.Builder
	event := Event{ID: 7, Type: "tool.output", SessionID: "s1", Payload: map[string]string{"chunk": "ok"}, At: time.Unix(0, 0).UTC()}
	if err := WriteSSE(&b, event); err != nil {
		t.Fatal(err)
	}
	got := b.String()
	for _, want := range []string{"event: tool.output\n", "id: 7\n", `"sessionId":"s1"`, `"chunk":"ok"`, "\n\n"} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected %q in %q", want, got)
		}
	}
}

func TestBrokerReplayAndRedaction(t *testing.T) {
	broker := NewBroker()
	event := broker.Publish("s1", "tool.output", map[string]string{"chunk": "api_key=secret-value"})
	replay := broker.Replay("s1", event.ID-1)
	if len(replay) != 1 {
		t.Fatalf("expected replay event: %#v", replay)
	}
	payload := replay[0].Payload.(map[string]string)
	if strings.Contains(payload["chunk"], "secret-value") || !strings.Contains(payload["chunk"], "[REDACTED]") {
		t.Fatalf("secret was not redacted: %#v", payload)
	}
}

func TestShouldReplayHistory(t *testing.T) {
	withoutReplay := httptest.NewRequest("GET", "/events?replay=false", nil)
	if shouldReplayHistory(withoutReplay, 0) {
		t.Fatal("initial loaded sessions should not replay broker history")
	}
	if !shouldReplayHistory(withoutReplay, 7) {
		t.Fatal("EventSource reconnects should replay missed events after Last-Event-ID")
	}
	withReplay := httptest.NewRequest("GET", "/events", nil)
	if !shouldReplayHistory(withReplay, 0) {
		t.Fatal("new live sessions should replay by default")
	}
}

func TestBrokerFanoutAndUnsubscribe(t *testing.T) {
	broker := NewBroker()
	ch, unsubscribe := broker.Subscribe("s1")
	broker.Publish("s1", "session.status", map[string]string{"status": "ok"})
	select {
	case event := <-ch:
		if event.Type != "session.status" || event.SessionID != "s1" {
			t.Fatalf("unexpected event: %#v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}
	unsubscribe()
	_, ok := <-ch
	if ok {
		t.Fatal("expected subscription channel to close")
	}
}
