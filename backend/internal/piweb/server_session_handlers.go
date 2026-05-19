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
	text := mergePromptAttachments(req.Text, req.Attachments)
	if strings.TrimSpace(text) == "" {
		writeError(w, http.StatusBadRequest, errors.New("text is required"))
		return
	}
	if session, changed, err := s.store.AutoNameSession(sessionID, text); err != nil {
		writeStoreError(w, err)
		return
	} else if changed {
		s.broker.Publish(sessionID, "session.renamed", session)
	}
	if s.config.EnablePiExecution {
		if err := s.runner.StartPiPrompt(s.context(), s.broker, s.store, sessionID, text); err != nil {
			writeError(w, http.StatusConflict, err)
			return
		}
	} else {
		go s.broker.PublishMockPrompt(s.context(), s.store, sessionID, text)
	}
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
func mergePromptAttachments(text string, attachments []string) string {
	if len(attachments) == 0 {
		return text
	}
	var b strings.Builder
	b.WriteString(text)
	for i, attachment := range attachments {
		if strings.TrimSpace(attachment) == "" {
			continue
		}
		b.WriteString("\n\n<attachment index=\"")
		b.WriteString(strconv.Itoa(i + 1))
		b.WriteString("\">\n")
		b.WriteString(attachment)
		b.WriteString("\n</attachment>")
	}
	return b.String()
}
