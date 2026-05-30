package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var discordAPIBaseURL = "https://discord.com/api/v10"
var telegramAPIBaseURL = "https://api.telegram.org"

type discordNotificationSettings struct {
	Enabled   bool
	Token     string
	ChannelID string
}

type telegramNotificationSettings struct {
	Enabled bool
	Token   string
	ChatID  string
}

func notifyRemoteResponseCompleted(root string, session Session, messages []Message) error {
	return notifyRemoteResponseCompletedForFile(root, "", session, messages)
}

func notifyRemoteResponseCompletedForFile(root string, sessionFile string, session Session, messages []Message) error {
	if isAgentChildSession(session) || isAgentChildSessionFile(sessionFile) {
		return nil
	}
	return errors.Join(
		notifyDiscordResponseCompleted(root, session, messages),
		notifyTelegramResponseCompleted(root, session, messages),
	)
}

func notifyRemoteChoiceQuestion(root string, session Session, messages []Message) error {
	return errors.Join(
		notifyDiscordChoiceQuestion(root, session, messages),
		notifyTelegramChoiceQuestion(root, session, messages),
	)
}

func notifyDiscordResponseCompleted(root string, session Session, messages []Message) error {
	if isAgentChildSession(session) || shouldSkipRemoteCompletionNotification(session, messages) {
		return nil
	}
	settings, err := WorkspaceSettings(root)
	if err != nil {
		return err
	}
	discord := discordCompletionSettings(settings.Effective)
	if !discord.Enabled || discord.Token == "" || discord.ChannelID == "" {
		return nil
	}
	return sendDiscordMessage(discord, discordCompletionMessage(session, latestUserQuestion(messages)))
}

func notifyTelegramResponseCompleted(root string, session Session, messages []Message) error {
	if isAgentChildSession(session) || shouldSkipRemoteCompletionNotification(session, messages) {
		return nil
	}
	settings, err := WorkspaceSettings(root)
	if err != nil {
		return err
	}
	telegram := telegramCompletionSettings(settings.Effective)
	if !telegram.Enabled || telegram.Token == "" || telegram.ChatID == "" {
		return nil
	}
	return sendTelegramMessage(telegram, telegramCompletionMessage(session, latestUserQuestion(messages)))
}

func notifyDiscordChoiceQuestion(root string, session Session, messages []Message) error {
	settings, err := WorkspaceSettings(root)
	if err != nil {
		return err
	}
	discord := discordCompletionSettings(settings.Effective)
	if !discord.Enabled || discord.Token == "" || discord.ChannelID == "" {
		return nil
	}
	return sendDiscordMessage(discord, discordChoiceQuestionMessage(session, latestChoiceQuestion(messages)))
}

func notifyTelegramChoiceQuestion(root string, session Session, messages []Message) error {
	settings, err := WorkspaceSettings(root)
	if err != nil {
		return err
	}
	telegram := telegramCompletionSettings(settings.Effective)
	if !telegram.Enabled || telegram.Token == "" || telegram.ChatID == "" {
		return nil
	}
	return sendTelegramMessage(telegram, telegramChoiceQuestionMessage(session, latestChoiceQuestion(messages)))
}

func isAgentChildSession(session Session) bool {
	return session.ParentID != "" || session.Kind == SessionKindSubagent || session.Kind == SessionKindTeam
}

func shouldSkipRemoteCompletionNotification(session Session, messages []Message) bool {
	return strings.EqualFold(strings.TrimSpace(session.Title), "new session") &&
		strings.EqualFold(strings.TrimSpace(latestUserQuestion(messages)), "hello")
}

func isAgentChildSessionFile(sessionFile string) bool {
	if strings.TrimSpace(sessionFile) == "" {
		return false
	}
	if header, err := readSessionHeader(sessionFile); err == nil && header.ParentSession != "" {
		return true
	}
	clean := cleanSessionPath(sessionFile)
	if teamsDir := DefaultPiTeamsDir(); teamsDir != "" {
		teamRoot := cleanSessionPath(teamsDir) + string(filepath.Separator)
		if strings.HasPrefix(clean, teamRoot) {
			return true
		}
	}
	for dir := filepath.Dir(clean); dir != "." && dir != string(filepath.Separator); dir = filepath.Dir(dir) {
		parentSessionFile := filepath.Join(filepath.Dir(dir), filepath.Base(dir)+".jsonl")
		if parentSessionFile == clean {
			continue
		}
		if _, err := os.Stat(parentSessionFile); err == nil {
			return true
		}
		next := filepath.Dir(dir)
		if next == dir {
			break
		}
	}
	return false
}

func discordCompletionSettings(settings map[string]any) discordNotificationSettings {
	remote, _ := settings["remoteNotifications"].(map[string]any)
	discord, _ := remote["discord"].(map[string]any)
	return discordNotificationSettings{
		Enabled:   boolSetting(discord, "enabled"),
		Token:     stringSetting(discord, "token"),
		ChannelID: stringSetting(discord, "channelId"),
	}
}

func telegramCompletionSettings(settings map[string]any) telegramNotificationSettings {
	remote, _ := settings["remoteNotifications"].(map[string]any)
	telegram, _ := remote["telegram"].(map[string]any)
	return telegramNotificationSettings{
		Enabled: boolSetting(telegram, "enabled"),
		Token:   stringSetting(telegram, "token"),
		ChatID:  stringSetting(telegram, "chatId"),
	}
}

func sendDiscordMessage(settings discordNotificationSettings, content string) error {
	payload, err := json.Marshal(map[string]string{"content": content})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	url := strings.TrimRight(discordAPIBaseURL, "/") + "/channels/" + settings.ChannelID + "/messages"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bot "+settings.Token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("discord notification failed: %s", res.Status)
	}
	return nil
}

func sendTelegramMessage(settings telegramNotificationSettings, content string) error {
	payload, err := json.Marshal(map[string]string{"chat_id": settings.ChatID, "text": content})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	url := strings.TrimRight(telegramAPIBaseURL, "/") + "/bot" + settings.Token + "/sendMessage"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("telegram notification failed: %s", res.Status)
	}
	return nil
}

func discordCompletionMessage(session Session, question string) string {
	content := completionMessage(session, question)
	if len(content) > 1900 {
		content = content[:1900]
	}
	return content
}

func telegramCompletionMessage(session Session, question string) string {
	content := completionMessage(session, question)
	if len(content) > 3900 {
		content = content[:3900]
	}
	return content
}

func discordChoiceQuestionMessage(session Session, question string) string {
	content := choiceQuestionMessage(session, question)
	if len(content) > 1900 {
		content = content[:1900]
	}
	return content
}

func telegramChoiceQuestionMessage(session Session, question string) string {
	content := choiceQuestionMessage(session, question)
	if len(content) > 3900 {
		content = content[:3900]
	}
	return content
}

func completionMessage(session Session, question string) string {
	return remoteNotificationMessage("✅ 답변 완료", session, question)
}

func choiceQuestionMessage(session Session, question string) string {
	return remoteNotificationMessage("❓ 선택지 질문", session, question)
}

func remoteNotificationMessage(prefix string, session Session, question string) string {
	title := strings.TrimSpace(session.Title)
	if title == "" {
		title = session.ID
	}
	content := prefix + ": " + truncateDiscordSessionTitle(sanitizeDiscordContent(title))
	if question = sanitizeDiscordContent(question); question != "" {
		content += "\n질문: " + question
	}
	return content
}

func latestUserQuestion(messages []Message) string {
	for index := len(messages) - 1; index >= 0; index-- {
		if messages[index].Kind == "user" && strings.TrimSpace(messages[index].Text) != "" {
			return messages[index].Text
		}
	}
	return ""
}

func latestChoiceQuestion(messages []Message) string {
	for index := len(messages) - 1; index >= 0; index-- {
		if messages[index].Kind == "pi" && containsFallbackChoice(messages[index].Text) {
			return extractFallbackChoiceQuestion(messages[index].Text)
		}
	}
	return ""
}

func extractFallbackChoiceQuestion(text string) string {
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return ""
	}
	var payload struct {
		Question string `json:"question"`
	}
	if err := json.Unmarshal([]byte(text[start:end+1]), &payload); err != nil {
		return ""
	}
	return payload.Question
}

func truncateDiscordSessionTitle(title string) string {
	runes := []rune(title)
	if len(runes) <= 8 {
		return title
	}
	return string(runes[:8]) + "..."
}

func sanitizeDiscordContent(value string) string {
	value = strings.ReplaceAll(value, "@", "@\u200b")
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	return strings.TrimSpace(value)
}

func boolSetting(settings map[string]any, key string) bool {
	value, _ := settings[key].(bool)
	return value
}

func stringSetting(settings map[string]any, key string) string {
	value, _ := settings[key].(string)
	return strings.TrimSpace(value)
}
