package backend

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func annotateSubagentSessions(sessionDir string, sessions []ParsedSession) {
	fileIDs := sessionFileIDs(sessions)
	for index := range sessions {
		if sessions[index].Session.Kind != "" {
			continue
		}
		parentID := parentIDFromHeader(sessions[index].Header.ParentSession, fileIDs)
		if parentID == "" {
			parentID = parentIDFromNestedSessionPath(sessionDir, sessions[index].File, fileIDs)
		}
		if parentID == "" {
			continue
		}
		sessions[index].Session.ParentID = parentID
		sessions[index].Session.Kind = SessionKindSubagent
		markChildSessionLiveFromFile(&sessions[index])
	}
}

func sessionFileIDs(sessions []ParsedSession) map[string]string {
	ids := map[string]string{}
	for _, session := range sessions {
		ids[cleanSessionPath(session.File)] = session.Header.ID
	}
	return ids
}

func parentIDFromHeader(parentFile string, fileIDs map[string]string) string {
	if parentFile == "" {
		return ""
	}
	if id := fileIDs[cleanSessionPath(parentFile)]; id != "" {
		return id
	}
	if header, err := readSessionHeader(parentFile); err == nil {
		return header.ID
	}
	return ""
}

func parentIDFromNestedSessionPath(sessionDir, file string, fileIDs map[string]string) string {
	rel, err := filepath.Rel(sessionDir, file)
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." {
		return ""
	}
	parts := strings.Split(rel, string(filepath.Separator))
	if len(parts) < 2 || parts[0] == "" {
		return ""
	}
	return fileIDs[cleanSessionPath(filepath.Join(sessionDir, parts[0]+".jsonl"))]
}

func cleanSessionPath(path string) string {
	if absolute, err := filepath.Abs(path); err == nil {
		return filepath.Clean(absolute)
	}
	return filepath.Clean(path)
}

func markChildSessionLiveFromFile(session *ParsedSession) {
	if !isPossiblyRunningChildSession(session.File, session.ModTime) {
		return
	}
	session.Session.Live = true
	session.Session.Active = true
	session.Session.LastUsed = "live"
}

func isPossiblyRunningChildSession(path string, modTime time.Time) bool {
	if path == "" || time.Since(modTime) > 30*time.Minute {
		return false
	}
	lastRole, lastStopReason := lastSessionMessageState(path)
	if lastRole == "" || lastRole == "assistant" && isTerminalAssistantStopReason(lastStopReason) {
		return false
	}
	return true
}

func isTerminalAssistantStopReason(reason string) bool {
	switch strings.ToLower(strings.TrimSpace(reason)) {
	case "", "tooluse", "tool_use":
		return false
	default:
		return true
	}
}

func lastSessionMessageState(path string) (string, string) {
	file, err := os.Open(path)
	if err != nil {
		return "", ""
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	var last agentMessage
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var entry sessionEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil || entry.Type != "message" {
			continue
		}
		var message agentMessage
		if err := json.Unmarshal(entry.Message, &message); err == nil {
			last = message
		}
	}
	return last.Role, last.StopReason
}

func readSessionHeader(path string) (sessionHeader, error) {
	file, err := os.Open(path)
	if err != nil {
		return sessionHeader{}, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var header sessionHeader
		if err := json.Unmarshal([]byte(line), &header); err != nil || header.Type != "session" {
			return sessionHeader{}, errors.New("session header is missing")
		}
		return header, nil
	}
	return sessionHeader{}, scanner.Err()
}
