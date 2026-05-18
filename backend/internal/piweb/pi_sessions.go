package piweb

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type sessionHeader struct {
	Type      string `json:"type"`
	Version   int    `json:"version"`
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	CWD       string `json:"cwd"`
}

type sessionEntry struct {
	Type          string          `json:"type"`
	ID            string          `json:"id"`
	ParentID      *string         `json:"parentId"`
	Timestamp     string          `json:"timestamp"`
	Message       json.RawMessage `json:"message"`
	Name          string          `json:"name"`
	Summary       string          `json:"summary"`
	TokensBefore  int             `json:"tokensBefore"`
	Provider      string          `json:"provider"`
	ModelID       string          `json:"modelId"`
	ThinkingLevel string          `json:"thinkingLevel"`
}

type agentMessage struct {
	Role       string          `json:"role"`
	Content    json.RawMessage `json:"content"`
	ToolName   string          `json:"toolName"`
	Command    string          `json:"command"`
	Output     string          `json:"output"`
	ExitCode   *int            `json:"exitCode"`
	Cancelled  bool            `json:"cancelled"`
	Truncated  bool            `json:"truncated"`
	IsError    bool            `json:"isError"`
	Provider   string          `json:"provider"`
	Model      string          `json:"model"`
	StopReason string          `json:"stopReason"`
}

type contentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	Thinking  string          `json:"thinking"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type ParsedSession struct {
	Header   sessionHeader
	Session  Session
	Messages []Message
	File     string
	ModTime  time.Time
}

func DefaultPiSessionDir() string {
	if value := os.Getenv("PI_CODING_AGENT_SESSION_DIR"); value != "" {
		return value
	}
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, ".pi", "agent", "sessions")
	}
	return ""
}

func LoadPiSessions(sessionDir string) ([]ParsedSession, error) {
	if sessionDir == "" {
		return nil, errors.New("session dir is empty")
	}
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
	var sessions []ParsedSession
	for _, file := range files {
		parsed, err := ParsePiSessionFile(file)
		if err == nil && parsed.Header.ID != "" && parsed.Header.CWD != "" {
			sessions = append(sessions, parsed)
		}
	}
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].ModTime.After(sessions[j].ModTime) })
	return sessions, nil
}

func ParsePiSessionFile(path string) (ParsedSession, error) {
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
	var header sessionHeader
	var messages []Message
	var title string
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var probe struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal([]byte(line), &probe); err != nil {
			continue
		}
		if probe.Type == "session" {
			_ = json.Unmarshal([]byte(line), &header)
			continue
		}
		var entry sessionEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		switch entry.Type {
		case "session_info":
			if entry.Name != "" {
				title = entry.Name
			}
		case "message":
			msg, ok := convertAgentMessage(entry.Message)
			if ok {
				messages = append(messages, msg)
				if title == "" && msg.Kind == "user" {
					title = trimTitle(msg.Text)
				}
			}
		case "compaction":
			messages = append(messages, Message{Kind: "pi", Text: fmt.Sprintf("context summarized · %d tokens before compaction", entry.TokensBefore)})
		case "model_change":
			messages = append(messages, Message{Kind: "banner", Text: fmt.Sprintf("model changed · %s/%s", entry.Provider, entry.ModelID)})
		case "thinking_level_change":
			messages = append(messages, Message{Kind: "banner", Text: fmt.Sprintf("thinking level · %s", entry.ThinkingLevel)})
		}
	}
	if err := scanner.Err(); err != nil {
		return ParsedSession{}, err
	}
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	session := Session{ID: header.ID, Title: title, LastUsed: relTime(stat.ModTime()), Workspace: workspaceIDFromPath(header.CWD)}
	return ParsedSession{Header: header, Session: session, Messages: messages, File: path, ModTime: stat.ModTime()}, nil
}

func convertAgentMessage(raw json.RawMessage) (Message, bool) {
	var msg agentMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return Message{}, false
	}
	switch msg.Role {
	case "user":
		return Message{Kind: "user", Text: contentText(msg.Content)}, true
	case "assistant":
		text, thinking, tool := assistantContent(msg.Content)
		if thinking != "" {
			return Message{Kind: "think", Text: thinking}, true
		}
		if tool.Tool != "" {
			return tool, true
		}
		return Message{Kind: "pi", Text: text}, true
	case "toolResult":
		status := "ok"
		if msg.IsError {
			status = "err"
		}
		return Message{Kind: "tool", Tool: msg.ToolName, Status: status, Body: contentText(msg.Content), CollapsedByDefault: true}, true
	case "bashExecution":
		status := "ok"
		if msg.ExitCode != nil && *msg.ExitCode != 0 {
			status = "err"
		}
		if msg.Cancelled {
			status = "err"
		}
		return Message{Kind: "tool", Tool: "bash", Args: msg.Command, Status: status, Body: msg.Output, CollapsedByDefault: true}, true
	case "custom":
		return Message{Kind: "pi", Text: contentText(msg.Content)}, true
	default:
		return Message{}, false
	}
}

func contentText(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return text
	}
	var blocks []contentBlock
	if err := json.Unmarshal(raw, &blocks); err == nil {
		var parts []string
		for _, block := range blocks {
			if block.Text != "" {
				parts = append(parts, block.Text)
			}
		}
		return strings.Join(parts, "\n")
	}
	return string(raw)
}

func assistantContent(raw json.RawMessage) (string, string, Message) {
	var blocks []contentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return contentText(raw), "", Message{}
	}
	var text []string
	for _, block := range blocks {
		switch block.Type {
		case "text":
			text = append(text, block.Text)
		case "thinking":
			return "", block.Thinking, Message{}
		case "toolCall":
			return "", "", Message{Kind: "tool", Tool: block.Name, Args: string(block.Arguments), Status: "running", CollapsedByDefault: true}
		}
	}
	return strings.Join(text, "\n"), "", Message{}
}

func trimTitle(value string) string {
	value = strings.Join(strings.Fields(value), " ")
	if len([]rune(value)) <= 48 {
		return value
	}
	return string([]rune(value)[:48]) + "…"
}

func relTime(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	case d < 30*24*time.Hour:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	default:
		return t.Format("2006-01-02")
	}
}

func workspaceIDFromPath(path string) string {
	return slug(filepath.Base(path))
}
