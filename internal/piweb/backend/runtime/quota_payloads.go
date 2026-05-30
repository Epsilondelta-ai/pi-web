package runtime

import (
	"encoding/json"
	"strconv"
	"strings"
)

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
