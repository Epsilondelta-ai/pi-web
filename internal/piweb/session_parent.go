package piweb

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
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
