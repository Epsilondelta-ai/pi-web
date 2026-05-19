package piweb

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type RuntimeStatus struct {
	Model         string `json:"model"`
	FiveHourQuota *int   `json:"fiveHourQuota,omitempty"`
	WeeklyQuota   *int   `json:"weeklyQuota,omitempty"`
	CurrentBranch string `json:"currentBranch"`
}

func MockRuntimeStatus() RuntimeStatus {
	fiveHour := 84
	weekly := 14
	return RuntimeStatus{Model: "GPT-5.5", FiveHourQuota: &fiveHour, WeeklyQuota: &weekly, CurrentBranch: "main"}
}

func WorkspaceRuntimeStatus(ctx context.Context, root string) (RuntimeStatus, error) {
	status := RuntimeStatus{}
	if model, err := CurrentPiModel(ctx, root); err == nil {
		status.Model = model
	}
	_ = RefreshPiWebStatus(ctx, root)
	if git, err := RealGitStatus(root); err == nil {
		status.CurrentBranch = git.Branch
	}
	fiveHour, weekly := RuntimeQuota(root)
	if fiveHour == nil && weekly == nil {
		fiveHour, weekly = LiveQuotaForModel(ctx, status.Model)
	}
	status.FiveHourQuota = fiveHour
	status.WeeklyQuota = weekly
	return status, nil
}

func CurrentPiModel(ctx context.Context, cwd string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pi", "--mode", "rpc", "--no-session")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PI_SKIP_VERSION_CHECK=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	stderr, _ := cmd.StderrPipe()
	var stderrBuf bytes.Buffer
	if stderr != nil {
		go func() { _, _ = stderrBuf.ReadFrom(stderr) }()
	}
	if err := cmd.Start(); err != nil {
		return "", err
	}
	defer func() {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		}
		_ = cmd.Wait()
	}()

	if _, err := io.WriteString(stdin, `{"id":"state","type":"get_state"}`+"\n"); err != nil {
		return "", err
	}
	_ = stdin.Close()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		model, matched, err := parseStateModelRPCLine(scanner.Text())
		if err != nil {
			return "", err
		}
		if matched {
			return model, nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if output := strings.TrimSpace(stderrBuf.String()); output != "" {
		return "", fmt.Errorf("pi get_state failed: %s", output)
	}
	return "", fmt.Errorf("pi get_state returned no response")
}

func RefreshPiWebStatus(ctx context.Context, cwd string) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pi", "--mode", "rpc", "--no-session")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PI_SKIP_VERSION_CHECK=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, _ := cmd.StderrPipe()
	var stderrBuf bytes.Buffer
	if stderr != nil {
		go func() { _, _ = stderrBuf.ReadFrom(stderr) }()
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	defer func() {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		}
		_ = cmd.Wait()
	}()

	if _, err := io.WriteString(stdin, `{"id":"web-status","type":"prompt","message":"/web-status"}`+"\n"); err != nil {
		return err
	}
	_ = stdin.Close()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		matched, err := parseRPCSuccessLine(scanner.Text(), "web-status", "prompt")
		if err != nil {
			return err
		}
		if matched {
			return nil
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if output := strings.TrimSpace(stderrBuf.String()); output != "" {
		return fmt.Errorf("pi /web-status failed: %s", output)
	}
	return fmt.Errorf("pi /web-status returned no response")
}

func parseRPCSuccessLine(line, id, command string) (bool, error) {
	var response struct {
		ID      string `json:"id"`
		Type    string `json:"type"`
		Command string `json:"command"`
		Success bool   `json:"success"`
		Error   string `json:"error"`
	}
	if err := json.Unmarshal([]byte(line), &response); err != nil {
		return false, nil
	}
	if response.ID != id || response.Type != "response" || response.Command != command {
		return false, nil
	}
	if !response.Success {
		if response.Error == "" {
			response.Error = command + " failed"
		}
		return true, fmt.Errorf("%s", response.Error)
	}
	return true, nil
}

func parseStateModelRPCLine(line string) (string, bool, error) {
	var response struct {
		ID      string `json:"id"`
		Type    string `json:"type"`
		Command string `json:"command"`
		Success bool   `json:"success"`
		Error   string `json:"error"`
		Data    struct {
			Model *struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Provider string `json:"provider"`
			} `json:"model"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(line), &response); err != nil {
		return "", false, nil
	}
	if response.ID != "state" || response.Type != "response" || response.Command != "get_state" {
		return "", false, nil
	}
	if !response.Success {
		if response.Error == "" {
			response.Error = "pi get_state failed"
		}
		return "", true, fmt.Errorf("%s", response.Error)
	}
	if response.Data.Model == nil {
		return "", true, nil
	}
	if strings.TrimSpace(response.Data.Model.Name) != "" {
		return response.Data.Model.Name, true, nil
	}
	if strings.TrimSpace(response.Data.Model.ID) != "" {
		return response.Data.Model.ID, true, nil
	}
	return response.Data.Model.Provider, true, nil
}

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

func RuntimeQuota(root string) (*int, *int) {
	fiveHour, weekly := quotaFromFile(root)
	if fiveHour == nil {
		fiveHour = quotaFromEnv("PI_WEB_5H_QUOTA_PERCENT", "PI_WEB_5H_QUOTA")
	}
	if weekly == nil {
		weekly = quotaFromEnv("PI_WEB_WEEKLY_QUOTA_PERCENT", "PI_WEB_WEEKLY_QUOTA")
	}
	return fiveHour, weekly
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

func quotaFromFile(root string) (*int, *int) {
	paths := []string{filepath.Join(root, ".pi", "web-status.json")}
	if home, err := os.UserHomeDir(); err == nil {
		paths = append(paths, filepath.Join(home, ".pi", "agent", "web-status.json"))
	}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var payload struct {
			FiveHourQuota *int `json:"fiveHourQuota"`
			WeeklyQuota   *int `json:"weeklyQuota"`
		}
		if json.Unmarshal(data, &payload) == nil {
			return normalizePercent(payload.FiveHourQuota), normalizePercent(payload.WeeklyQuota)
		}
	}
	return nil, nil
}

type quotaUsageWindow struct {
	UsedPercent        any `json:"used_percent"`
	LimitWindowSeconds any `json:"limit_window_seconds"`
}

type kimiUsagePayload struct {
	Usage  *kimiLimit  `json:"usage"`
	Limits []kimiLimit `json:"limits"`
}

type kimiLimit struct {
	Label          string       `json:"label"`
	Name           string       `json:"name"`
	Type           string       `json:"type"`
	UsedPercent    any          `json:"used_percent"`
	UsedPercentage any          `json:"usedPercentage"`
	Limit          any          `json:"limit"`
	Used           any          `json:"used"`
	Remaining      any          `json:"remaining"`
	Window         *quotaWindow `json:"window"`
	Detail         *kimiLimit   `json:"detail"`
	Details        *kimiLimit   `json:"details"`
}

type quotaWindow struct {
	Duration any    `json:"duration"`
	Minutes  any    `json:"minutes"`
	Unit     string `json:"unit"`
}

type zaiQuotaPayload struct {
	Data struct {
		Limits []zaiLimit `json:"limits"`
	} `json:"data"`
	Limits []zaiLimit `json:"limits"`
}

type zaiLimit struct {
	Type           string `json:"type"`
	Percentage     any    `json:"percentage"`
	UsedPercent    any    `json:"used_percent"`
	UsedPercentage any    `json:"usedPercentage"`
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

func remainingFromWindow(window *quotaUsageWindow) *int {
	if window == nil {
		return nil
	}
	used, ok := numberFromAny(window.UsedPercent)
	if !ok {
		return nil
	}
	remaining := int(100 - used + 0.5)
	return normalizePercent(&remaining)
}

func kimiWindow(payload *kimiUsagePayload, label string) *int {
	for i := range payload.Limits {
		if kimiLimitMatches(payload.Limits[i], label) {
			return remainingFromUsedPercent(kimiUsedPercent(&payload.Limits[i]))
		}
	}
	if payload.Usage != nil {
		return remainingFromUsedPercent(kimiUsedPercent(payload.Usage))
	}
	return nil
}

func kimiLimitMatches(limit kimiLimit, label string) bool {
	minutes := quotaWindowMinutes(limit.Window)
	text := strings.ToLower(limit.Label + " " + limit.Name + " " + limit.Type)
	if label == "5H:" {
		return minutes == 300 || strings.Contains(text, "5h") || strings.Contains(text, "5 h") || strings.Contains(text, "five")
	}
	return minutes == 10080 || strings.Contains(text, "week") || strings.Contains(text, "7d") || strings.Contains(text, "7 d")
}

func kimiUsedPercent(limit *kimiLimit) (float64, bool) {
	if limit == nil {
		return 0, false
	}
	source := *limit
	if source.Details != nil {
		source = mergeKimiLimit(source, *source.Details)
	}
	if source.Detail != nil {
		source = mergeKimiLimit(source, *source.Detail)
	}
	if used, ok := firstNumberFromAny(source.UsedPercent, source.UsedPercentage); ok {
		if used <= 1 {
			return used * 100, true
		}
		return used, true
	}
	limitValue, hasLimit := numberFromAny(source.Limit)
	if !hasLimit || limitValue <= 0 {
		return 0, false
	}
	if used, ok := numberFromAny(source.Used); ok {
		return used / limitValue * 100, true
	}
	if remaining, ok := numberFromAny(source.Remaining); ok {
		return (limitValue - remaining) / limitValue * 100, true
	}
	return 0, false
}

func mergeKimiLimit(base, overlay kimiLimit) kimiLimit {
	if overlay.UsedPercent != nil {
		base.UsedPercent = overlay.UsedPercent
	}
	if overlay.UsedPercentage != nil {
		base.UsedPercentage = overlay.UsedPercentage
	}
	if overlay.Limit != nil {
		base.Limit = overlay.Limit
	}
	if overlay.Used != nil {
		base.Used = overlay.Used
	}
	if overlay.Remaining != nil {
		base.Remaining = overlay.Remaining
	}
	return base
}

func zaiWindow(payload *zaiQuotaPayload, label string) *int {
	limits := payload.Data.Limits
	if len(limits) == 0 {
		limits = payload.Limits
	}
	if len(limits) == 0 {
		return nil
	}
	index := 0
	if label == "7D:" && len(limits) > 1 {
		index = 1
	}
	for i, limit := range limits {
		if strings.EqualFold(limit.Type, "TOKENS_LIMIT") {
			index = i
			break
		}
	}
	if label == "7D:" {
		for i := range limits {
			if i != index && remainingFromUsedPercent(zaiUsedPercent(limits[i])) != nil {
				index = i
				break
			}
		}
	}
	return remainingFromUsedPercent(zaiUsedPercent(limits[index]))
}

func zaiUsedPercent(limit zaiLimit) (float64, bool) {
	return firstNumberFromAny(limit.Percentage, limit.UsedPercent, limit.UsedPercentage)
}

func remainingFromUsedPercent(used float64, ok bool) *int {
	if !ok {
		return nil
	}
	remaining := int(100 - used + 0.5)
	return normalizePercent(&remaining)
}

func quotaWindowMinutes(window *quotaWindow) int {
	if window == nil {
		return 0
	}
	direct, ok := firstNumberFromAny(window.Duration, window.Minutes)
	if !ok {
		return 0
	}
	unit := strings.ToLower(window.Unit)
	switch {
	case strings.HasPrefix(unit, "hour"):
		return int(direct * 60)
	case strings.HasPrefix(unit, "day"):
		return int(direct * 1440)
	case strings.HasPrefix(unit, "second"):
		return int((direct + 59) / 60)
	default:
		return int(direct)
	}
}

func firstNumberFromAny(values ...any) (float64, bool) {
	for _, value := range values {
		if number, ok := numberFromAny(value); ok {
			return number, true
		}
	}
	return 0, false
}

func numberFromAny(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case json.Number:
		parsed, err := v.Float64()
		return parsed, err == nil
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
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
