package piweb

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	session, messages, err := s.store.Session(r.PathValue("sessionID"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session, "messages": messages})
}
func (s *Server) renameSession(w http.ResponseWriter, r *http.Request) {
	var req RenameSessionRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	session, err := s.store.RenameSession(r.PathValue("sessionID"), req.Title)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session})
}
func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteSession(r.PathValue("sessionID")); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
func (s *Server) prompt(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	if _, _, err := s.store.Session(sessionID); err != nil {
		writeStoreError(w, err)
		return
	}
	var req PromptRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	promptText := mergePromptAttachments(req.Text, req.Attachments)
	imageAttachments := imagePromptAttachments(req.Attachments)
	if strings.TrimSpace(promptText) == "" && len(imageAttachments) == 0 {
		writeError(w, http.StatusBadRequest, errors.New("text is required"))
		return
	}
	displayText := promptDisplayText(req.Text, req.Attachments)
	if session, changed, err := s.store.AutoNameSession(sessionID, displayText); err != nil {
		writeStoreError(w, err)
		return
	} else if changed {
		s.broker.Publish(sessionID, "session.renamed", session)
	}
	if s.config.EnablePiExecution {
		err := s.runner.StartPiPrompt(
			s.context(),
			s.broker,
			s.store,
			sessionID,
			promptText,
			imageAttachments,
			displayText,
		)
		if err != nil {
			writeError(w, http.StatusConflict, err)
			return
		}
	} else {
		go s.broker.PublishMockPrompt(s.context(), s.store, sessionID, displayText)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "realPi": s.config.EnablePiExecution})
}
func (s *Server) steerSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	if _, _, err := s.store.Session(sessionID); err != nil {
		writeStoreError(w, err)
		return
	}
	var req PromptRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	promptText := mergePromptAttachments(req.Text, req.Attachments)
	imageAttachments := imagePromptAttachments(req.Attachments)
	if strings.TrimSpace(promptText) == "" && len(imageAttachments) == 0 {
		writeError(w, http.StatusBadRequest, errors.New("text is required"))
		return
	}
	displayText := promptDisplayText(req.Text, req.Attachments)
	if s.config.EnablePiExecution {
		if err := s.runner.Steer(sessionID, promptText, imageAttachments); err != nil {
			writeError(w, http.StatusConflict, err)
			return
		}
	}
	user := Message{Kind: "user", Text: displayText, Attachments: imageAttachments}
	_ = s.store.AppendMessage(sessionID, user)
	s.broker.Publish(sessionID, "session.message", user)
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "realPi": s.config.EnablePiExecution})
}
func (s *Server) cancelSession(w http.ResponseWriter, r *http.Request) {
	cancelled := s.runner.Cancel(r.PathValue("sessionID"))
	if cancelled {
		s.broker.Publish(r.PathValue("sessionID"), "session.status", map[string]string{"status": "cancelled"})
	}
	writeJSON(w, http.StatusOK, map[string]any{"cancelled": cancelled})
}
func (s *Server) sessionEvents(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	if _, _, err := s.store.Session(sessionID); err != nil {
		writeStoreError(w, err)
		return
	}
	s.broker.ServeSession(w, r, sessionID)
}
func mergePromptAttachments(text string, attachments []PromptAttachment) string {
	if len(attachments) == 0 {
		return text
	}
	var b strings.Builder
	b.WriteString(text)
	for i, attachment := range attachments {
		if attachment.Type == "image" || strings.TrimSpace(attachment.Content) == "" {
			continue
		}
		b.WriteString("\n\n<attachment index=\"")
		b.WriteString(strconv.Itoa(i + 1))
		b.WriteString("\">\n")
		b.WriteString(attachmentPromptText(attachment))
		b.WriteString("\n</attachment>")
	}
	return b.String()
}

func attachmentPromptText(attachment PromptAttachment) string {
	if strings.TrimSpace(attachment.Name) == "" {
		return attachment.Content
	}
	return "File: " + attachment.Name + "\n\n" + attachment.Content
}

func imagePromptAttachments(attachments []PromptAttachment) []PromptAttachment {
	var images []PromptAttachment
	for _, attachment := range attachments {
		if attachment.Type == "image" && strings.TrimSpace(attachment.DataURL) != "" {
			images = append(images, attachment)
		}
	}
	return images
}

func promptDisplayText(text string, attachments []PromptAttachment) string {
	if strings.TrimSpace(text) != "" {
		return text
	}
	for _, attachment := range attachments {
		kind := attachment.Type
		if kind == "" {
			kind = "file"
		}
		if strings.TrimSpace(attachment.Name) == "" {
			return "[" + kind + "]"
		}
		return "[" + kind + ": " + attachment.Name + "]"
	}
	return text
}
