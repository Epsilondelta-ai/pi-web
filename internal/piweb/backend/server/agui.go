package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	aguitypes "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	aguisse "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/encoding/sse"
)

type aguiForwardedProps struct {
	Text        string             `json:"text"`
	Attachments []PromptAttachment `json:"attachments"`
}

type aguiStreamState struct {
	threadID        string
	runID           string
	messageID       string
	textOpen        bool
	thinkingID      string
	thinkingOpen    bool
	toolIDs         map[string][]string
	toolNames       map[string]string
	terminalEmitted bool
}

func (s *Server) aguiSessionRun(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	if _, _, err := s.store.Session(sessionID); err != nil {
		writeStoreError(w, err)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, errors.New("streaming unsupported"))
		return
	}
	var input aguitypes.RunAgentInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	props := aguiProps(input.ForwardedProps)
	promptText := strings.TrimSpace(props.Text)
	if promptText == "" {
		promptText = lastUserMessageText(input.Messages)
	}
	promptText = mergePromptAttachments(promptText, props.Attachments)
	images := imagePromptAttachments(props.Attachments)
	if strings.TrimSpace(promptText) == "" && len(images) == 0 {
		writeError(w, http.StatusBadRequest, errors.New("text is required"))
		return
	}
	displayText := promptDisplayText(props.Text, props.Attachments)
	if strings.TrimSpace(displayText) == "" {
		displayText = lastUserMessageText(input.Messages)
	}
	if session, changed, err := s.store.AutoNameSession(sessionID, displayText); err != nil {
		writeStoreError(w, err)
		return
	} else if changed {
		s.broker.Publish(sessionID, "session.renamed", session)
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	stream := newAguiEventStream(w, r.Context())
	state := newAguiStreamState(input.ThreadID, input.RunID, sessionID)
	stream.write(aguievents.NewRunStartedEvent(state.threadID, state.runID))

	events, unsubscribe := s.broker.Subscribe(sessionID)
	defer unsubscribe()
	if s.config.EnablePiExecution {
		if err := s.runner.StartPiPrompt(s.context(), s.broker, s.store, sessionID, promptText, images, displayText); err != nil {
			stream.write(aguievents.NewRunErrorEvent(err.Error(), aguievents.WithRunID(state.runID)))
			return
		}
	} else {
		go s.broker.PublishMockPrompt(s.context(), s.store, sessionID, displayText)
	}

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if state.consume(event, stream) {
				return
			}
		}
	}
}

type aguiEventStream struct {
	ctx    context.Context
	writer http.ResponseWriter
	sse    *aguisse.SSEWriter
}

func newAguiEventStream(w http.ResponseWriter, ctx context.Context) *aguiEventStream {
	return &aguiEventStream{ctx: ctx, writer: w, sse: aguisse.NewSSEWriter()}
}

func (s *aguiEventStream) write(event aguievents.Event) {
	if event == nil {
		return
	}
	_ = s.sse.WriteEvent(s.ctx, s.writer, event)
}

func newAguiStreamState(threadID, runID, fallback string) *aguiStreamState {
	if strings.TrimSpace(threadID) == "" {
		threadID = fallback
	}
	if strings.TrimSpace(runID) == "" {
		runID = aguievents.GenerateRunID()
	}
	return &aguiStreamState{
		threadID:  threadID,
		runID:     runID,
		toolIDs:   map[string][]string{},
		toolNames: map[string]string{},
	}
}

func (s *aguiStreamState) consume(event Event, stream *aguiEventStream) bool {
	switch event.Type {
	case "session.delta":
		payload, ok := event.Payload.(map[string]string)
		if !ok || payload["delta"] == "" {
			return false
		}
		if payload["kind"] == "think" {
			s.emitThinkingDelta(payload["delta"], stream)
			return false
		}
		s.emitTextDelta(payload["delta"], stream)
	case "session.message":
		msg, ok := event.Payload.(Message)
		if !ok || msg.Kind != "pi" {
			return false
		}
		if s.textOpen {
			stream.write(aguievents.NewTextMessageEndEvent(s.messageID))
			s.textOpen = false
		} else if strings.TrimSpace(msg.Text) != "" {
			s.emitTextDelta(msg.Text, stream)
			stream.write(aguievents.NewTextMessageEndEvent(s.messageID))
			s.textOpen = false
		}
	case "tool.started":
		if msg, ok := event.Payload.(Message); ok {
			s.emitToolStart(msg, stream)
		}
	case "tool.output":
		if payload, ok := event.Payload.(map[string]string); ok {
			s.emitToolArgs(payload["tool"], payload["chunk"], stream)
		}
	case "tool.finished":
		if msg, ok := event.Payload.(Message); ok {
			s.emitToolFinish(msg, stream)
		}
	case "error":
		stream.write(aguievents.NewRunErrorEvent(fmt.Sprint(event.Payload), aguievents.WithRunID(s.runID)))
		s.terminalEmitted = true
		return true
	case "session.status":
		payload, ok := event.Payload.(map[string]string)
		if ok && (payload["status"] == "idle" || payload["status"] == "cancelled") {
			s.closeOpen(stream)
			stream.write(aguievents.NewRunFinishedEvent(s.threadID, s.runID))
			s.terminalEmitted = true
			return true
		}
	}
	return false
}

func (s *aguiStreamState) emitTextDelta(delta string, stream *aguiEventStream) {
	if delta == "" || (!s.textOpen && strings.TrimSpace(delta) == "") {
		return
	}
	if !s.textOpen {
		s.messageID = aguievents.GenerateMessageID()
		stream.write(aguievents.NewTextMessageStartEvent(s.messageID, aguievents.WithRole("assistant")))
		s.textOpen = true
	}
	stream.write(aguievents.NewTextMessageContentEvent(s.messageID, delta))
}

func (s *aguiStreamState) emitThinkingDelta(delta string, stream *aguiEventStream) {
	if strings.TrimSpace(delta) == "" {
		return
	}
	if !s.thinkingOpen {
		s.thinkingID = aguievents.GenerateMessageID()
		stream.write(aguievents.NewReasoningStartEvent(s.thinkingID))
		stream.write(aguievents.NewReasoningMessageStartEvent(s.thinkingID, "reasoning"))
		s.thinkingOpen = true
	}
	stream.write(aguievents.NewReasoningMessageContentEvent(s.thinkingID, delta))
}

func (s *aguiStreamState) emitToolStart(msg Message, stream *aguiEventStream) {
	name := strings.TrimSpace(msg.Tool)
	if name == "" {
		name = "tool"
	}
	id := aguievents.GenerateToolCallID()
	s.toolIDs[name] = append(s.toolIDs[name], id)
	s.toolNames[id] = name
	stream.write(aguievents.NewToolCallStartEvent(id, name))
	if strings.TrimSpace(msg.Args) != "" {
		s.emitToolArgs(name, msg.Args, stream)
	}
}

func (s *aguiStreamState) emitToolArgs(tool, delta string, stream *aguiEventStream) {
	if strings.TrimSpace(delta) == "" {
		return
	}
	id := s.currentToolID(tool)
	if id == "" {
		id = aguievents.GenerateToolCallID()
		s.toolIDs[tool] = append(s.toolIDs[tool], id)
		s.toolNames[id] = tool
		stream.write(aguievents.NewToolCallStartEvent(id, tool))
	}
	stream.write(aguievents.NewToolCallArgsEvent(id, delta))
}

func (s *aguiStreamState) currentToolID(name string) string {
	ids := s.toolIDs[name]
	if len(ids) == 0 {
		return ""
	}
	return ids[len(ids)-1]
}

func (s *aguiStreamState) popToolID(name string) string {
	ids := s.toolIDs[name]
	if len(ids) == 0 {
		return ""
	}
	id := ids[len(ids)-1]
	if len(ids) == 1 {
		delete(s.toolIDs, name)
		return id
	}
	s.toolIDs[name] = ids[:len(ids)-1]
	return id
}

func (s *aguiStreamState) emitToolFinish(msg Message, stream *aguiEventStream) {
	name := strings.TrimSpace(msg.Tool)
	if name == "" {
		name = "tool"
	}
	id := s.popToolID(name)
	if id == "" {
		id = aguievents.GenerateToolCallID()
		stream.write(aguievents.NewToolCallStartEvent(id, name))
	}
	stream.write(aguievents.NewToolCallEndEvent(id))
	if strings.TrimSpace(msg.Body) != "" {
		stream.write(aguievents.NewToolCallResultEvent(aguievents.GenerateMessageID(), id, msg.Body))
	}
	delete(s.toolNames, id)
}

func (s *aguiStreamState) closeOpen(stream *aguiEventStream) {
	if s.textOpen {
		stream.write(aguievents.NewTextMessageEndEvent(s.messageID))
		s.textOpen = false
	}
	if s.thinkingOpen {
		stream.write(aguievents.NewReasoningMessageEndEvent(s.thinkingID))
		stream.write(aguievents.NewReasoningEndEvent(s.thinkingID))
		s.thinkingOpen = false
	}
	for name, ids := range s.toolIDs {
		for i := len(ids) - 1; i >= 0; i-- {
			stream.write(aguievents.NewToolCallEndEvent(ids[i]))
			delete(s.toolNames, ids[i])
		}
		delete(s.toolIDs, name)
	}
}

func aguiProps(value any) aguiForwardedProps {
	var props aguiForwardedProps
	if value == nil {
		return props
	}
	data, err := json.Marshal(value)
	if err != nil {
		return props
	}
	_ = json.Unmarshal(data, &props)
	return props
}

func lastUserMessageText(messages []aguitypes.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}
		switch content := messages[i].Content.(type) {
		case string:
			return content
		default:
			return fmt.Sprint(content)
		}
	}
	return ""
}
