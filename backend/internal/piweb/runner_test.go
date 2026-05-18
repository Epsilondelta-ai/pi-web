package piweb

import (
	"encoding/json"
	"testing"
)

func TestHandlePiJSONEventIgnoresToolCallDeltaAsText(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	ok := handlePiJSONEvent(`{"type":"message_update","assistantMessageEvent":{"type":"toolcall_delta","delta":"{\"command\":\"pwd\"}"}}`, broker, store, "8e7c-44ff", state)
	if !ok {
		t.Fatal("expected json event to be handled")
	}
	if replay := broker.Replay("8e7c-44ff", 0); len(replay) != 0 {
		t.Fatalf("toolcall delta should not be published as chat text: %#v", replay)
	}
}

func TestHandlePiJSONEventStreamsTextDelta(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	handlePiJSONEvent(`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hello"}}`, broker, store, "8e7c-44ff", state)
	replay := broker.Replay("8e7c-44ff", 0)
	if len(replay) != 1 || replay[0].Type != "session.delta" {
		t.Fatalf("expected text delta event: %#v", replay)
	}
}

func TestHandlePiJSONEventPublishesFinalFallbackChoiceAfterStreaming(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	choice := "```json\n{\"type\":\"piweb_choice\",\"id\":\"test\",\"question\":\"Pick?\",\"options\":[{\"label\":\"A\",\"value\":\"a\"}],\"allowCustom\":false}\n```"
	encoded, _ := json.Marshal(choice)
	handlePiJSONEvent(`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":`+string(encoded)+`}}`, broker, store, "8e7c-44ff", state)
	handlePiJSONEvent(`{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":`+string(encoded)+`}]}}`, broker, store, "8e7c-44ff", state)
	replay := broker.Replay("8e7c-44ff", 0)
	if len(replay) != 2 || replay[0].Type != "session.delta" || replay[1].Type != "session.message" {
		t.Fatalf("expected final fallback choice message after delta: %#v", replay)
	}
}

func TestHandlePiJSONEventSkipsFinalToolCallPlaceholders(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}
	handlePiJSONEvent(`{"type":"message_end","message":{"role":"assistant","content":[{"type":"toolCall","name":"bash","arguments":{"command":"pwd"}}]}}`, broker, store, "8e7c-44ff", state)
	if replay := broker.Replay("8e7c-44ff", 0); len(replay) != 0 {
		t.Fatalf("assistant tool call placeholders should not be replayed as running tools: %#v", replay)
	}
	_, messages, _ := store.Session("8e7c-44ff")
	if len(messages) != 5 {
		t.Fatalf("assistant tool call placeholders should not be stored: %#v", messages)
	}
}
