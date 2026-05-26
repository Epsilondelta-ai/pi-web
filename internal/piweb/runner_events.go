package piweb

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

type jsonStreamState struct {
	streamedText            bool
	streamedThinking        bool
	fallbackChoiceNotified  bool
	onFallbackChoiceMessage func()
}

func handlePiJSONEvent(line string, broker *Broker, store *Store, sessionID string, state *jsonStreamState) bool {
	var event struct {
		Type                  string          `json:"type"`
		Command               string          `json:"command"`
		Success               bool            `json:"success"`
		Error                 string          `json:"error"`
		Message               json.RawMessage `json:"message"`
		ToolName              string          `json:"toolName"`
		Args                  json.RawMessage `json:"args"`
		PartialResult         json.RawMessage `json:"partialResult"`
		Result                json.RawMessage `json:"result"`
		IsError               bool            `json:"isError"`
		AssistantMessageEvent struct {
			Type  string `json:"type"`
			Delta string `json:"delta"`
			Text  string `json:"text"`
		} `json:"assistantMessageEvent"`
	}
	if err := json.Unmarshal([]byte(line), &event); err != nil || event.Type == "" {
		return false
	}
	switch event.Type {
	case "session", "agent_start", "turn_start", "queue_update":
		return true
	case "response":
		if !event.Success && event.Error != "" {
			broker.Publish(sessionID, "error", map[string]string{"error": event.Error, "command": event.Command})
		}
		return true
	case "message_update":
		delta := event.AssistantMessageEvent.Delta
		if delta == "" {
			delta = event.AssistantMessageEvent.Text
		}
		if delta == "" {
			return true
		}
		switch event.AssistantMessageEvent.Type {
		case "thinking_delta", "reasoning_delta":
			state.streamedThinking = true
			broker.Publish(sessionID, "session.delta", map[string]string{"kind": "think", "delta": delta})
		case "text_delta":
			state.streamedText = true
			broker.Publish(sessionID, "session.delta", map[string]string{"kind": "pi", "delta": delta})
		case "toolcall_delta", "toolcall_start", "toolcall_end", "text_start", "text_end", "thinking_start", "thinking_end", "start", "done":
			return true
		}
		return true
	case "message_end":
		for _, msg := range convertAgentMessages(event.Message) {
			if msg.Kind == "user" {
				continue
			}
			if msg.Kind == "tool" && msg.Status == "running" {
				continue
			}
			_ = store.AppendMessage(sessionID, msg)
			if msg.Kind == "pi" && containsFallbackChoice(msg.Text) && !state.fallbackChoiceNotified {
				state.fallbackChoiceNotified = true
				if state.onFallbackChoiceMessage != nil {
					state.onFallbackChoiceMessage()
				}
			}
			if msg.Kind == "pi" && state.streamedText && !containsFallbackChoice(msg.Text) {
				continue
			}
			if msg.Kind == "think" && state.streamedThinking {
				continue
			}
			broker.Publish(sessionID, eventTypeForMessage(msg), msg)
		}
		return true
	case "tool_execution_start":
		broker.Publish(sessionID, "tool.started", Message{Kind: "tool", Tool: event.ToolName, Args: string(event.Args), Status: "running", CollapsedByDefault: true})
		return true
	case "tool_execution_update":
		broker.Publish(sessionID, "tool.output", map[string]string{"tool": event.ToolName, "chunk": jsonChunk(event.PartialResult)})
		return true
	case "tool_execution_end":
		status := "ok"
		if event.IsError {
			status = "err"
		}
		msg := Message{Kind: "tool", Tool: event.ToolName, Args: string(event.Args), Status: status, Body: jsonChunk(event.Result), CollapsedByDefault: true}
		_ = store.AppendMessage(sessionID, msg)
		broker.Publish(sessionID, "tool.finished", msg)
		return true
	case "agent_end", "turn_end":
		return true
	default:
		return true
	}
}
func containsFallbackChoice(text string) bool {
	return strings.Contains(text, "piweb_choice")
}
func jsonChunk(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return text
	}
	return fmt.Sprintf("%s", raw)
}
func eventTypeForMessage(msg Message) string {
	if msg.Kind == "tool" && msg.Status == "running" {
		return "tool.started"
	}
	if msg.Kind == "tool" {
		return "tool.finished"
	}
	return "session.message"
}
func streamPipe(pipe io.Reader, onLine func(string), done chan<- struct{}) {
	if done != nil {
		defer close(done)
	}
	reader := bufio.NewReaderSize(pipe, 64*1024)
	for {
		line, err := reader.ReadString('\n')
		if line != "" {
			line = strings.TrimSuffix(line, "\n")
			line = strings.TrimSuffix(line, "\r")
			onLine(line)
		}
		if err != nil {
			return
		}
	}
}
