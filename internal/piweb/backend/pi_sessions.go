package backend

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	SessionKindSubagent = "subagent"
	SessionKindTeam     = "team"
	defaultSessionTitle = "new session"
)

type sessionHeader struct {
	Type          string `json:"type"`
	Version       int    `json:"version"`
	ID            string `json:"id"`
	Timestamp     string `json:"timestamp"`
	CWD           string `json:"cwd"`
	ParentSession string `json:"parentSession"`
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
	Data      string          `json:"data"`
	MIMEType  string          `json:"mimeType"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type ParsedSession struct {
	Header    sessionHeader
	Session   Session
	Messages  []Message
	File      string
	ModTime   time.Time
	CreatedAt time.Time
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
	files, err := piSessionFiles(sessionDir)
	if err != nil {
		return nil, err
	}
	var sessions []ParsedSession
	for _, file := range files {
		parsed, err := ParsePiSessionFile(file)
		if err == nil && parsed.Header.ID != "" && parsed.Header.CWD != "" {
			sessions = append(sessions, parsed)
		}
	}
	annotateSubagentSessions(sessionDir, sessions)
	sort.Slice(sessions, func(i, j int) bool { return sessionCreatedAfter(sessions[i], sessions[j]) })
	return sessions, nil
}

func sessionCreatedAfter(left, right ParsedSession) bool {
	if !left.CreatedAt.Equal(right.CreatedAt) {
		return left.CreatedAt.After(right.CreatedAt)
	}
	return left.File > right.File
}

func CreatePiSessionFile(cwd string) (Session, string, error) {
	cwd = filepath.Clean(cwd)
	id := createSessionID()
	now := time.Now().UTC()
	sessionDir := piSessionDirForCWD(cwd)
	if err := os.MkdirAll(sessionDir, 0o700); err != nil {
		return Session{}, "", err
	}
	fileTimestamp := strings.NewReplacer(":", "-", ".", "-").Replace(now.Format(time.RFC3339Nano))
	path := filepath.Join(sessionDir, fmt.Sprintf("%s_%s.jsonl", fileTimestamp, id))
	header := sessionHeader{Type: "session", Version: 3, ID: id, Timestamp: now.Format(time.RFC3339Nano), CWD: cwd}
	line, err := json.Marshal(header)
	if err != nil {
		return Session{}, "", err
	}
	if err := os.WriteFile(path, append(line, '\n'), 0o600); err != nil {
		return Session{}, "", err
	}
	session := Session{
		ID:        id,
		Title:     defaultSessionTitle,
		LastUsed:  "now",
		Workspace: workspaceIDFromPath(cwd),
		Active:    true,
	}
	return session, path, nil
}
func piSessionDirForCWD(cwd string) string {
	safePath := "--" + strings.NewReplacer("/", "-", "\\", "-", ":", "-").Replace(strings.TrimLeft(cwd, "/\\")) + "--"
	return filepath.Join(DefaultPiSessionDir(), safePath)
}
func createSessionID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return strings.ReplaceAll(time.Now().UTC().Format("20060102150405.000000000"), ".", "")
	}
	return fmt.Sprintf(
		"%s-%s-%s-%s-%s",
		hex.EncodeToString(bytes[0:4]),
		hex.EncodeToString(bytes[4:6]),
		hex.EncodeToString(bytes[6:8]),
		hex.EncodeToString(bytes[8:10]),
		hex.EncodeToString(bytes[10:16]),
	)
}
func canAutoNameTitle(title string) bool {
	title = strings.TrimSpace(title)
	return title == "" || title == defaultSessionTitle
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
			converted := convertAgentMessages(entry.Message)
			for _, msg := range converted {
				messages = append(messages, msg)
				if msg.Kind == "user" && canAutoNameTitle(title) {
					if promptTitle := trimTitle(msg.Text); promptTitle != "" {
						title = promptTitle
					}
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
		title = defaultSessionTitle
	}
	createdAt, _ := time.Parse(time.RFC3339Nano, header.Timestamp)
	session := Session{ID: header.ID, Title: title, LastUsed: relTime(stat.ModTime()), Workspace: workspaceIDFromPath(header.CWD)}
	return ParsedSession{
		Header:    header,
		Session:   session,
		Messages:  messages,
		File:      path,
		ModTime:   stat.ModTime(),
		CreatedAt: createdAt,
	}, nil
}
