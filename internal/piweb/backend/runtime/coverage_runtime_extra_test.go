package runtime

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCoverageRuntimeQuotaPayloadHelpers(t *testing.T) {
	if got := remainingFromWindow(&quotaUsageWindow{UsedPercent: 12.2}); got == nil || *got != 88 {
		t.Fatalf("remaining window=%v", got)
	}
	if remainingFromWindow(nil) != nil || remainingFromWindow(&quotaUsageWindow{UsedPercent: struct{}{}}) != nil {
		t.Fatal("expected nil remaining")
	}
	payload := kimiUsagePayload{Limits: []kimiLimit{{Label: "5H", UsedPercent: 0.2}, {Name: "weekly", Detail: &kimiLimit{Limit: 100, Used: 30}}}}
	if got := kimiWindow(&payload, "5H:"); got == nil || *got != 80 {
		t.Fatalf("kimi 5h=%v", got)
	}
	if got := kimiWindow(&payload, "7D:"); got == nil || *got != 70 {
		t.Fatalf("kimi weekly=%v", got)
	}
	payload = kimiUsagePayload{Usage: &kimiLimit{Limit: 100, Remaining: 40}}
	if got := kimiWindow(&payload, "5H:"); got == nil || *got != 40 {
		t.Fatalf("kimi usage=%v", got)
	}
	if kimiWindow(&kimiUsagePayload{}, "5H:") != nil {
		t.Fatal("expected nil kimi")
	}
	for _, window := range []*quotaWindow{{Duration: 2, Unit: "hours"}, {Duration: 1, Unit: "days"}, {Duration: 61, Unit: "seconds"}, {Minutes: json.Number("15")}} {
		if quotaWindowMinutes(window) == 0 {
			t.Fatalf("unexpected window minutes for %+v", window)
		}
	}
	if quotaWindowMinutes(nil) != 0 || quotaWindowMinutes(&quotaWindow{Duration: struct{}{}}) != 0 {
		t.Fatal("expected zero window minutes")
	}
	zai := zaiQuotaPayload{Limits: []zaiLimit{{Type: "TOKENS_LIMIT", Percentage: 25}, {UsedPercentage: "50"}}}
	if got := zaiWindow(&zai, "5H:"); got == nil || *got != 75 {
		t.Fatalf("zai 5h=%v", got)
	}
	if got := zaiWindow(&zai, "7D:"); got == nil || *got != 50 {
		t.Fatalf("zai 7d=%v", got)
	}
	if zaiWindow(&zaiQuotaPayload{}, "5H:") != nil {
		t.Fatal("expected nil zai")
	}
	for _, value := range []any{float64(1), 1, json.Number("1.5"), " 2 "} {
		if _, ok := numberFromAny(value); !ok {
			t.Fatalf("expected number for %#v", value)
		}
	}
	if _, ok := numberFromAny("x"); ok {
		t.Fatal("unexpected number")
	}
	t.Setenv("PI_WEB_5H_QUOTA", "-1")
	t.Setenv("PI_WEB_WEEKLY_QUOTA", "101")
	five, weekly := RuntimeQuota(t.TempDir())
	if five == nil || *five != 0 || weekly == nil || *weekly != 100 {
		t.Fatalf("env quotas %v %v", five, weekly)
	}
	if bearerHeaders("tok")["Authorization"] != "Bearer tok" {
		t.Fatal("bearerHeaders failed")
	}
}

func TestCoverageRuntimeQuotaMoreHelpers(t *testing.T) {
	if got, ok := kimiUsedPercent(&kimiLimit{Details: &kimiLimit{UsedPercentage: 50}}); !ok || got != 50 {
		t.Fatalf("unexpected kimi details percent %v %v", got, ok)
	}
	if _, ok := kimiUsedPercent(nil); ok {
		t.Fatal("expected nil kimi percent false")
	}
	if _, ok := kimiUsedPercent(&kimiLimit{Limit: 0, Used: 1}); ok {
		t.Fatal("expected bad limit false")
	}
	if got := remainingFromUsedPercent(150, true); got == nil || *got != 0 {
		t.Fatalf("remaining clamp=%v", got)
	}
	if remainingFromUsedPercent(0, false) != nil {
		t.Fatal("expected nil remaining from false")
	}
	t.Setenv("PI_WEB_5H_QUOTA", "bad")
	if quotaFromEnv("PI_WEB_5H_QUOTA") != nil {
		t.Fatal("expected bad env nil")
	}
	oldHome := os.Getenv("HOME")
	t.Setenv("HOME", filepath.Join(t.TempDir(), "missing"))
	if five, weekly := fetchCodexQuota(context.Background()); five != nil || weekly != nil {
		t.Fatal("expected codex missing auth nil")
	}
	if five, weekly := fetchKimiCodeQuota(context.Background()); five != nil || weekly != nil {
		t.Fatal("expected kimi missing token nil")
	}
	t.Setenv("HOME", oldHome)
}

func TestCoverageRuntimeHTTPAndRPCHelpers(t *testing.T) {
	_ = time.Now()
	t.Setenv("HOME", t.TempDir())
	if ok := readAuthJSON(&struct{}{}); ok {
		t.Fatal("expected readAuthJSON false without auth")
	}
	if ok := getJSON(context.Background(), "http://127.0.0.1:1", nil, &struct{}{}); ok {
		t.Fatal("expected getJSON false")
	}
	_ = http.MethodGet
	for _, line := range []string{`{"type":"state","model":"gpt-5"}`, `data: {"model":"claude"}`} {
		_, _, _ = parseStateModelRPCLine(line)
	}
}
