package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestPluginEventsPublishAndReplay(t *testing.T) {
	installTestPlugin(t, "event-plugin")
	broker := NewBroker()
	server := NewServer(Config{}, NewMockStore(), broker)

	publish := httptest.NewRequest(
		http.MethodPost,
		"/api/plugins/event-plugin/events/updates",
		strings.NewReader(`{"type":"active.start","payload":{"sessionId":"s1","workspaceId":"w1"}}`),
	)
	publishRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(publishRes, publish)
	if publishRes.Code != http.StatusOK {
		t.Fatalf("publish status = %d body = %s", publishRes.Code, publishRes.Body.String())
	}

	events := broker.Replay(pluginEventChannel("event-plugin", "updates"), 0)
	if len(events) != 1 || events[0].Type != "active.start" {
		t.Fatalf("events = %#v", events)
	}
	payload, ok := events[0].Payload.(map[string]any)
	if !ok || payload["sessionId"] != "s1" || payload["workspaceId"] != "w1" {
		t.Fatalf("payload = %#v", events[0].Payload)
	}
}

func TestPluginEventsReplayHonorsLastEventID(t *testing.T) {
	installTestPlugin(t, "event-plugin")
	broker := NewBroker()
	server := NewServer(Config{}, NewMockStore(), broker)
	broker.Publish(pluginEventChannel("event-plugin", "updates"), "updates.old", map[string]string{"value": "old"})
	latest := broker.Publish(pluginEventChannel("event-plugin", "updates"), "updates.new", map[string]string{"value": "new"})

	req := httptest.NewRequest(http.MethodGet, "/api/plugins/event-plugin/events/updates", nil)
	req.Header.Set("Last-Event-ID", "1")
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	res := httptest.NewRecorder()
	done := make(chan struct{})

	go func() {
		server.Handler().ServeHTTP(res, req)
		close(done)
	}()
	cancel()
	<-done

	body := res.Body.String()
	if !strings.Contains(body, "updates.new") || strings.Contains(body, "updates.old") || !strings.Contains(body, `id: `+strconv.FormatUint(latest.ID, 10)) {
		t.Fatalf("unexpected replay body: %s", body)
	}
}

func TestPluginEventsRouteIsSSE(t *testing.T) {
	installTestPlugin(t, "event-plugin")
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	req := httptest.NewRequest(http.MethodGet, "/api/plugins/event-plugin/events/updates", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	res := httptest.NewRecorder()
	done := make(chan struct{})

	go func() {
		server.Handler().ServeHTTP(res, req)
		close(done)
	}()
	cancel()
	<-done

	if contentType := res.Header().Get("Content-Type"); contentType != "text/event-stream" {
		t.Fatalf("Content-Type = %q, want text/event-stream", contentType)
	}
}

func TestPluginEventsRejectInvalidRequests(t *testing.T) {
	installTestPlugin(t, "event-plugin")
	server := NewServer(Config{}, NewMockStore(), NewBroker())
	cases := []struct {
		method string
		path   string
		body   string
		status int
	}{
		{http.MethodGet, "/api/plugins/missing/events/updates", "", http.StatusNotFound},
		{http.MethodPost, "/api/plugins/event-plugin/events/updates", `{"type":""}`, http.StatusBadRequest},
		{http.MethodPost, "/api/plugins/event-plugin/events/updates", `{"type":"bad\nvalue"}`, http.StatusBadRequest},
	}

	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		res := httptest.NewRecorder()
		server.Handler().ServeHTTP(res, req)
		if res.Code != tc.status {
			t.Fatalf("%s %s status = %d, want %d", tc.method, tc.path, res.Code, tc.status)
		}
	}
}

func installTestPlugin(t *testing.T, id string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	path := filepath.Join(home, ".pi-web", "plugins", id)
	if err := os.MkdirAll(path, 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := map[string]any{"id": id, "entry": "index.js", "version": "test"}
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "plugin.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "index.js"), []byte("export default () => {};"), 0o600); err != nil {
		t.Fatal(err)
	}
}
