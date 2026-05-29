package sessions

import (
	"bufio"
	"encoding/json"
	"errors"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func LoadPiSessionSummaries(sessionDir string) ([]ParsedSession, error) {
	if sessionDir == "" {
		return nil, errors.New("session dir is empty")
	}
	files, err := piSessionFiles(sessionDir)
	if err != nil {
		return nil, err
	}
	var sessions []ParsedSession
	for _, file := range files {
		parsed, err := ParsePiSessionSummary(file)
		if err == nil && parsed.Header.ID != "" && parsed.Header.CWD != "" {
			sessions = append(sessions, parsed)
		}
	}
	annotateSubagentSessions(sessionDir, sessions)
	sort.Slice(sessions, func(i, j int) bool { return sessionCreatedAfter(sessions[i], sessions[j]) })
	return sessions, nil
}

func piSessionFiles(sessionDir string) ([]string, error) {
	var files []string
	if err := filepath.WalkDir(sessionDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.Type().IsRegular() && strings.HasSuffix(entry.Name(), ".jsonl") {
			files = append(files, path)
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return files, nil
}

func ParsePiSessionSummary(path string) (ParsedSession, error) {
	file, err := os.Open(path)
	if err != nil {
		return ParsedSession{}, err
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return ParsedSession{}, err
	}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	var header SessionHeader
	var title string
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var entry sessionEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		switch entry.Type {
		case "session":
			_ = json.Unmarshal([]byte(line), &header)
		case "session_info":
			if entry.Name != "" {
				title = entry.Name
			}
		case "message":
			if canAutoNameTitle(title) {
				title = summaryTitleFromMessage(entry.Message, title)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return ParsedSession{}, err
	}
	return summarizedSession(path, stat.ModTime(), header, title), nil
}

func summaryTitleFromMessage(raw json.RawMessage, fallback string) string {
	var msg agentMessage
	if err := json.Unmarshal(raw, &msg); err != nil || msg.Role != "user" {
		return fallback
	}
	if title := trimTitle(strings.TrimSpace(imageFileTagPattern.ReplaceAllString(contentText(msg.Content), ""))); title != "" {
		return title
	}
	return fallback
}

func summarizedSession(path string, modTime time.Time, header SessionHeader, title string) ParsedSession {
	if title == "" {
		title = defaultSessionTitle
	}
	createdAt, _ := time.Parse(time.RFC3339Nano, header.Timestamp)
	session := shared.Session{ID: header.ID, Title: title, LastUsed: relTime(modTime), Workspace: workspaceIDFromPath(header.CWD)}
	return ParsedSession{Header: header, Session: session, File: path, ModTime: modTime, CreatedAt: createdAt}
}
