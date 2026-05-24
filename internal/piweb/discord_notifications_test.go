package piweb

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNotifyDiscordResponseCompletedSendsConfiguredMessage(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	settings := `{"remoteNotifications":{"discord":{"enabled":true,"token":"secret-token","channelId":"123456"}}}`
	if err := os.WriteFile(filepath.Join(root, ".pi", "settings.json"), []byte(settings), 0o600); err != nil {
		t.Fatal(err)
	}

	var gotPath, gotAuth string
	var gotBody map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatal(err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	previousBaseURL := discordAPIBaseURL
	discordAPIBaseURL = server.URL
	defer func() { discordAPIBaseURL = previousBaseURL }()

	err := notifyDiscordResponseCompleted(root, Session{ID: "8e7c-44ff", Title: "done @everyone\nnow"}, []Message{
		{Kind: "user", Text: "first question"},
		{Kind: "pi", Text: "answer"},
		{Kind: "user", Text: "latest @here\nquestion"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/channels/123456/messages" {
		t.Fatalf("unexpected path %q", gotPath)
	}
	if gotAuth != "Bot secret-token" {
		t.Fatalf("unexpected auth %q", gotAuth)
	}
	content := gotBody["content"]
	if !strings.Contains(content, "답변 완료: done @\u200be...") {
		t.Fatalf("unexpected title content %q", content)
	}
	if !strings.Contains(content, "질문: latest @\u200bhere question") {
		t.Fatalf("unexpected question content %q", content)
	}
}

func TestNotifyDiscordResponseCompletedSkipsIncompleteSettings(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".pi", "settings.json"), []byte(`{"remoteNotifications":{"discord":{"enabled":true}}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	defer server.Close()
	previousBaseURL := discordAPIBaseURL
	discordAPIBaseURL = server.URL
	defer func() { discordAPIBaseURL = previousBaseURL }()

	if err := notifyDiscordResponseCompleted(root, Session{ID: "8e7c-44ff"}, nil); err != nil {
		t.Fatal(err)
	}
	if called {
		t.Fatal("discord API should not be called without token and channel ID")
	}
}
