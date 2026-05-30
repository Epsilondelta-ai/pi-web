package runtime

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func LiveQuotaForModel(ctx context.Context, model string) (*int, *int) {
	name := strings.ToLower(model)
	switch {
	case strings.Contains(name, "gpt") || strings.Contains(name, "codex"):
		return fetchCodexQuota(ctx)
	case strings.Contains(name, "kimi"):
		return fetchKimiCodeQuota(ctx)
	case strings.Contains(name, "glm") || strings.Contains(name, "zai") || strings.Contains(name, "z.ai"):
		return fetchZaiQuota(ctx)
	default:
		return nil, nil
	}
}

func RuntimeQuota(_ string) (*int, *int) {
	return quotaFromEnv("PI_WEB_5H_QUOTA_PERCENT", "PI_WEB_5H_QUOTA"),
		quotaFromEnv("PI_WEB_WEEKLY_QUOTA_PERCENT", "PI_WEB_WEEKLY_QUOTA")
}

func fetchCodexQuota(ctx context.Context) (*int, *int) {
	var auth struct {
		OpenAICodex struct {
			Access    string `json:"access"`
			AccountID string `json:"accountId"`
		} `json:"openai-codex"`
	}
	if !readAuthJSON(&auth) || auth.OpenAICodex.Access == "" || auth.OpenAICodex.AccountID == "" {
		return nil, nil
	}
	var payload struct {
		RateLimit struct {
			PrimaryWindow   *quotaUsageWindow `json:"primary_window"`
			SecondaryWindow *quotaUsageWindow `json:"secondary_window"`
		} `json:"rate_limit"`
	}
	ok := getJSON(ctx, "https://chatgpt.com/backend-api/wham/usage", map[string]string{
		"Authorization":      "Bearer " + auth.OpenAICodex.Access,
		"chatgpt-account-id": auth.OpenAICodex.AccountID,
		"Content-Type":       "application/json",
	}, &payload)
	if !ok {
		return nil, nil
	}
	return remainingFromWindow(payload.RateLimit.PrimaryWindow), remainingFromWindow(payload.RateLimit.SecondaryWindow)
}

func fetchKimiCodeQuota(ctx context.Context) (*int, *int) {
	var auth struct {
		KimiCoding struct {
			Access string `json:"access"`
			Key    string `json:"key"`
		} `json:"kimi-coding"`
	}
	_ = readAuthJSON(&auth)
	token := firstNonEmpty(auth.KimiCoding.Access, auth.KimiCoding.Key, os.Getenv("KIMI_API_KEY"))
	if token == "" {
		return nil, nil
	}
	var payload kimiUsagePayload
	if !getJSON(ctx, "https://api.kimi.com/coding/v1/usages", bearerHeaders(token), &payload) {
		return nil, nil
	}
	return kimiWindow(&payload, "5H:"), kimiWindow(&payload, "7D:")
}

func fetchZaiQuota(ctx context.Context) (*int, *int) {
	var auth struct {
		Zai struct {
			Key    string `json:"key"`
			Access string `json:"access"`
		} `json:"zai"`
	}
	_ = readAuthJSON(&auth)
	token := firstNonEmpty(auth.Zai.Key, auth.Zai.Access, os.Getenv("ZAI_API_KEY"), os.Getenv("GLM_API_KEY"))
	if token == "" {
		return nil, nil
	}
	urls := []string{"https://api.z.ai/api/monitor/usage/quota/limit", "https://open.bigmodel.cn/api/monitor/usage/quota/limit"}
	for _, url := range urls {
		var payload zaiQuotaPayload
		if getJSON(ctx, url, bearerHeaders(token), &payload) {
			return zaiWindow(&payload, "5H:"), zaiWindow(&payload, "7D:")
		}
	}
	return nil, nil
}

func readAuthJSON(target any) bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	data, err := os.ReadFile(filepath.Join(home, ".pi", "agent", "auth.json"))
	return err == nil && json.Unmarshal(data, target) == nil
}

func getJSON(ctx context.Context, url string, headers map[string]string, target any) bool {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return false
	}
	return json.NewDecoder(res.Body).Decode(target) == nil
}

func bearerHeaders(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token, "Content-Type": "application/json"}
}

func quotaFromEnv(names ...string) *int {
	for _, name := range names {
		if value, ok := os.LookupEnv(name); ok {
			parsed, err := strconv.Atoi(strings.TrimSpace(value))
			if err == nil {
				return normalizePercent(&parsed)
			}
		}
	}
	return nil
}

func normalizePercent(value *int) *int {
	if value == nil {
		return nil
	}
	v := *value
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	return &v
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
