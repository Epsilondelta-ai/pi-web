package piweb

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
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
	return errors.Join(
		notifyDiscordResponseCompleted(root, session, messages),
		notifyTelegramResponseCompleted(root, session, messages),
	)
}

func notifyDiscordResponseCompleted(root string, session Session, messages []Message) error {
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

func completionMessage(session Session, question string) string {
	title := strings.TrimSpace(session.Title)
	if title == "" {
		title = session.ID
	}
	content := "✅ 답변 완료: " + truncateDiscordSessionTitle(sanitizeDiscordContent(title))
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
