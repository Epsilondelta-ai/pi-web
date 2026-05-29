package piweb

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var imageFileTagPattern = regexp.MustCompile(`(?s)<file name="[^"]+">\[Image:.*?</file>\s*`)

func ParsePiSessionLine(line string) (Message, bool) {
	messages := ParsePiSessionLineMessages(line)
	if len(messages) == 0 {
		return Message{}, false
	}
	return messages[0], true
}
func ParsePiSessionLineMessages(line string) []Message {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil
	}
	var entry sessionEntry
	if err := json.Unmarshal([]byte(line), &entry); err != nil {
		return nil
	}
	switch entry.Type {
	case "message":
		return convertAgentMessages(entry.Message)
	case "compaction":
		return []Message{{Kind: "pi", Text: fmt.Sprintf("context summarized · %d tokens before compaction", entry.TokensBefore)}}
	case "model_change":
		return []Message{{Kind: "banner", Text: fmt.Sprintf("model changed · %s/%s", entry.Provider, entry.ModelID)}}
	case "thinking_level_change":
		return []Message{{Kind: "banner", Text: fmt.Sprintf("thinking level · %s", entry.ThinkingLevel)}}
	default:
		return nil
	}
}
func convertAgentMessages(raw json.RawMessage) []Message {
	var msg agentMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil
	}
	switch msg.Role {
	case "user":
		return userMessages(msg.Content)
	case "assistant":
		return assistantMessages(msg.Content)
	case "toolResult":
		status := "ok"
		if msg.IsError {
			status = "err"
		}
		return []Message{{Kind: "tool", Tool: msg.ToolName, Status: status, Body: contentText(msg.Content), CollapsedByDefault: true}}
	case "bashExecution":
		status := "ok"
		if msg.ExitCode != nil && *msg.ExitCode != 0 {
			status = "err"
		}
		if msg.Cancelled {
			status = "err"
		}
		return []Message{{Kind: "tool", Tool: "bash", Args: msg.Command, Status: status, Body: msg.Output, CollapsedByDefault: true}}
	case "custom":
		return []Message{{Kind: "pi", Text: contentText(msg.Content)}}
	default:
		return nil
	}
}
func userMessages(raw json.RawMessage) []Message {
	text := strings.TrimSpace(imageFileTagPattern.ReplaceAllString(contentText(raw), ""))
	return []Message{{Kind: "user", Text: text, Attachments: contentImageAttachments(raw)}}
}

func contentImageAttachments(raw json.RawMessage) []PromptAttachment {
	var blocks []contentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return nil
	}
	var attachments []PromptAttachment
	for index, block := range blocks {
		if block.Type != "image" || block.Data == "" {
			continue
		}
		mimeType := block.MIMEType
		if mimeType == "" {
			mimeType = "image/png"
		}
		attachments = append(attachments, PromptAttachment{
			Type:     "image",
			Name:     "image-" + fmt.Sprint(index+1) + imageExtension(mimeType),
			MIMEType: mimeType,
			DataURL:  imageDataURL(block.Data, mimeType),
		})
	}
	return attachments
}

func imageDataURL(data string, mimeType string) string {
	if strings.HasPrefix(data, "data:") {
		return data
	}
	return "data:" + mimeType + ";base64," + data
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
func assistantMessages(raw json.RawMessage) []Message {
	var blocks []contentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		text := contentText(raw)
		if text == "" {
			return nil
		}
		return []Message{{Kind: "pi", Text: text}}
	}
	var messages []Message
	var text []string
	flushText := func() {
		if len(text) == 0 {
			return
		}
		messages = append(messages, Message{Kind: "pi", Text: strings.Join(text, "\n")})
		text = nil
	}
	for _, block := range blocks {
		switch block.Type {
		case "text":
			if block.Text != "" {
				text = append(text, block.Text)
			}
		case "thinking":
			flushText()
			if block.Thinking != "" {
				messages = append(messages, Message{Kind: "think", Text: block.Thinking})
			}
		case "toolCall":
			flushText()
		}
	}
	flushText()
	return messages
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
