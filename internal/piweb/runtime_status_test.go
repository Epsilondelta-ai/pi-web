package piweb

import (
	"context"
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

func TestWorkspaceRuntimeQuotaStatusWritesProjectStatus(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PI_WEB_5H_QUOTA", "33")
	t.Setenv("PI_WEB_WEEKLY_QUOTA", "44")
	status := WorkspaceRuntimeQuotaStatus(context.Background(), root, "GPT-5.5")
	if status.FiveHourQuota == nil || *status.FiveHourQuota != 33 || status.WeeklyQuota == nil || *status.WeeklyQuota != 44 {
		t.Fatalf("unexpected quota status: %+v", status)
	}
	data, err := os.ReadFile(filepath.Join(root, ".pi", "web-status.json"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(data)
	if !strings.Contains(body, `"fiveHourQuota": 33`) || !strings.Contains(body, `"weeklyQuota": 44`) {
		t.Fatalf("quota was not written: %s", body)
	}
}

func TestRuntimeQuotaLoadsProjectFileAndClamps(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".pi"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".pi", "web-status.json"), []byte(`{"fiveHourQuota":120,"weeklyQuota":14}`), 0o600); err != nil {
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
