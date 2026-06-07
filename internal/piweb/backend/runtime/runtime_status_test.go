package runtime

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseStateModelRPCLineUsesDisplayName(t *testing.T) {
	line := `{"id":"state","type":"response","command":"get_state","success":true,"data":{"model":{"id":"gpt-5.5","name":"GPT-5.5","provider":"openai-codex"},"thinkingLevel":"high"}}`
	model, matched, err := parseStateModelRPCLine(line)
	if err != nil {
		t.Fatal(err)
	}
	if !matched || model != "GPT-5.5" {
		t.Fatalf("expected GPT-5.5, got matched=%v model=%q", matched, model)
	}
	status, matched, err := parseStateModelStatusRPCLine(line)
	if err != nil {
		t.Fatal(err)
	}
	if !matched || status.ThinkingLevel != "high" {
		t.Fatalf("expected high thinking level, got matched=%v status=%+v", matched, status)
	}
}

func TestQuotaMappersReturnRemainingPercent(t *testing.T) {
	primary := &quotaUsageWindow{UsedPercent: float64(16)}
	if got := remainingFromWindow(primary); got == nil || *got != 84 {
		t.Fatalf("expected codex remaining 84, got %v", got)
	}
	kimi := &kimiUsagePayload{Limits: []kimiLimit{{Label: "5h", UsedPercent: float64(80)}, {Label: "week", UsedPercent: float64(86)}}}
	if got := kimiWindow(kimi, "5H:"); got == nil || *got != 20 {
		t.Fatalf("expected kimi 5h remaining 20, got %v", got)
	}
	if got := kimiWindow(kimi, "7D:"); got == nil || *got != 14 {
		t.Fatalf("expected kimi weekly remaining 14, got %v", got)
	}
	zai := &zaiQuotaPayload{Limits: []zaiLimit{{Type: "TOKENS_LIMIT", Percentage: float64(10)}, {Type: "WEEKLY", Percentage: float64(90)}}}
	if got := zaiWindow(zai, "7D:"); got == nil || *got != 10 {
		t.Fatalf("expected zai weekly remaining 10, got %v", got)
	}
}

func TestRuntimeStatusFromSettingsReadsEffectiveSettings(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, ".pi", "agent"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".pi", "agent", "settings.json"), []byte(`{"defaultProvider":"openai-codex","defaultModel":"gpt-5.4","defaultThinkingLevel":"low"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".pi", "settings.json"), []byte(`{"defaultModel":"gpt-5.5","defaultThinkingLevel":"high"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".pi", "pi-web.json"), []byte(`{"defaultModel":"legacy-wrong","defaultThinkingLevel":"xhigh"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	status, err := runtimeStatusFromSettings(root)
	if err != nil {
		t.Fatal(err)
	}
	if status.ModelProvider != "openai-codex" || status.Model != "gpt-5.5" || status.ThinkingLevel != "high" {
		t.Fatalf("unexpected settings status: %+v", status)
	}
}

func TestWorkspaceRuntimeStatusUsesSettingsWithoutPiRPC(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, ".pi", "agent"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".pi", "agent", "settings.json"), []byte(`{"defaultProvider":"zai","defaultModel":"glm-4.6","defaultThinkingLevel":"medium"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	status, err := WorkspaceRuntimeStatus(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	if status.ModelProvider != "zai" || status.Model != "glm-4.6" || status.ThinkingLevel != "medium" {
		t.Fatalf("unexpected runtime status: %+v", status)
	}
}

func TestWorkspaceRuntimeStatusFallsBackToEnvQuota(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("PI_WEB_5H_QUOTA", "33")
	t.Setenv("PI_WEB_WEEKLY_QUOTA", "44")
	if err := os.MkdirAll(filepath.Join(home, ".pi", "agent"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".pi", "agent", "settings.json"), []byte(`{"defaultModel":"unknown"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	status, err := WorkspaceRuntimeStatus(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	if status.FiveHourQuota == nil || *status.FiveHourQuota != 33 || status.WeeklyQuota == nil || *status.WeeklyQuota != 44 {
		t.Fatalf("unexpected quota status: %+v", status)
	}
}

func TestRuntimeQuotaIgnoresProjectWebStatusAndClampsEnv(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PI_WEB_5H_QUOTA", "120")
	t.Setenv("PI_WEB_WEEKLY_QUOTA", "14")
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".pi", "pi-web.json"), []byte(`{"status":{"fiveHourQuota":1,"weeklyQuota":2}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	fiveHour, weekly := RuntimeQuota(root)
	if fiveHour == nil || *fiveHour != 100 {
		t.Fatalf("expected fiveHour 100, got %v", fiveHour)
	}
	if weekly == nil || *weekly != 14 {
		t.Fatalf("expected weekly 14, got %v", weekly)
	}
}

func TestWorkspaceRuntimeStatusPrefersLiveQuotaOverStaleProjectWebStatus(t *testing.T) {
	oldClient := http.DefaultClient
	t.Cleanup(func() { http.DefaultClient = oldClient })
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, ".pi", "agent"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".pi", "agent", "auth.json"), []byte(`{"openai-codex":{"access":"oa","accountId":"acct"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".pi", "agent", "settings.json"), []byte(`{"defaultModel":"GPT-5.5"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".pi", "pi-web.json"), []byte(`{"status":{"fiveHourQuota":86,"weeklyQuota":54}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		body := `{"rate_limit":{"primary_window":{"used_percent":8},"secondary_window":{"used_percent":13}}}`
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}

	status, err := WorkspaceRuntimeStatus(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	if status.FiveHourQuota == nil || *status.FiveHourQuota != 92 || status.WeeklyQuota == nil || *status.WeeklyQuota != 87 {
		t.Fatalf("expected live quota, got %+v", status)
	}
}
