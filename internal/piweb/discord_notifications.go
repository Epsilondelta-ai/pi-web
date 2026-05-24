package piweb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

var discordAPIBaseURL = "https://discord.com/api/v10"

type discordNotificationSettings struct {
	Enabled   bool
	Token     string
	ChannelID string
}

func notifyDiscordResponseCompleted(root string, session Session) error {
	settings, err := WorkspaceSettings(root)
	if err != nil {
		return err
	}
	discord := discordCompletionSettings(settings.Effective)
	if !discord.Enabled || discord.Token == "" || discord.ChannelID == "" {
		return nil
	}
	return sendDiscordMessage(discord, discordCompletionMessage(session))
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

func discordCompletionMessage(session Session) string {
	title := strings.TrimSpace(session.Title)
	if title == "" {
		title = session.ID
	}
	content := "✅ 답변 완료: " + sanitizeDiscordContent(title)
	if len(content) > 1900 {
		content = content[:1900]
	}
	return content
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
