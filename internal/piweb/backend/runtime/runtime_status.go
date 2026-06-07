package runtime

import (
	"context"
	"errors"
	backendworkspace "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/workspace"
	"strings"

	backendauth "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/auth"
)

type RuntimeStatus struct {
	Model         string `json:"model,omitempty"`
	ModelProvider string `json:"modelProvider,omitempty"`
	ThinkingLevel string `json:"thinkingLevel,omitempty"`
	FiveHourQuota *int   `json:"fiveHourQuota,omitempty"`
	WeeklyQuota   *int   `json:"weeklyQuota,omitempty"`
	CurrentBranch string `json:"currentBranch,omitempty"`
	Warning       string `json:"warning,omitempty"`
}

func MockRuntimeStatus() RuntimeStatus {
	fiveHour := 84
	weekly := 14
	return RuntimeStatus{Model: "GPT-5.5", CurrentBranch: "main", FiveHourQuota: &fiveHour, WeeklyQuota: &weekly}
}

func WorkspaceRuntimeStatus(ctx context.Context, root string) (RuntimeStatus, error) {
	status, err := runtimeStatusFromSettings(root)
	if err != nil {
		status, err = CurrentPiModelStatus(ctx, root)
		if err != nil {
			status = RuntimeStatus{}
			if warning := runtimeAuthWarning(err); warning != "" {
				status.Warning = warning
			}
		}
	}
	if status.Warning == "" {
		status.Warning = anthropicSubscriptionAuthWarning(status)
	}
	applyRuntimeQuota(ctx, root, &status)
	return status, nil
}

func runtimeStatusFromSettings(root string) (RuntimeStatus, error) {
	settings, err := backendworkspace.WorkspaceSettings(root)
	if err != nil {
		return RuntimeStatus{}, err
	}
	_, hasGlobalProvider := settings.Global["defaultProvider"]
	_, hasProjectProvider := settings.Project["defaultProvider"]
	_, hasGlobalModel := settings.Global["defaultModel"]
	_, hasProjectModel := settings.Project["defaultModel"]
	_, hasGlobalThinking := settings.Global["defaultThinkingLevel"]
	_, hasProjectThinking := settings.Project["defaultThinkingLevel"]
	if !hasGlobalProvider && !hasProjectProvider && !hasGlobalModel && !hasProjectModel && !hasGlobalThinking && !hasProjectThinking {
		return RuntimeStatus{}, errors.New("runtime model settings unavailable")
	}
	provider, _ := settings.Effective["defaultProvider"].(string)
	model, _ := settings.Effective["defaultModel"].(string)
	thinkingLevel, _ := settings.Effective["defaultThinkingLevel"].(string)
	status := RuntimeStatus{
		Model:         strings.TrimSpace(model),
		ModelProvider: strings.TrimSpace(provider),
		ThinkingLevel: strings.TrimSpace(thinkingLevel),
	}
	if status.Model == "" && status.ModelProvider == "" && status.ThinkingLevel == "" {
		return RuntimeStatus{}, errors.New("runtime model settings unavailable")
	}
	return status, nil
}

func runtimeAuthWarning(err error) string {
	if err == nil {
		return ""
	}
	message := strings.TrimSpace(err.Error())
	lower := strings.ToLower(message)
	patterns := []string{
		"authentication failed",
		"credentials may have expired",
		"no api key found",
		"no models available",
		"no model selected",
		"models.json error",
		"oauth",
		"unauthorized",
		"invalid_grant",
		"token expired",
	}
	for _, pattern := range patterns {
		if strings.Contains(lower, pattern) {
			return message
		}
	}
	return ""
}

func anthropicSubscriptionAuthWarning(status RuntimeStatus) string {
	if status.ModelProvider != "anthropic" {
		return ""
	}
	path, err := backendauth.AuthPath()
	if err != nil {
		return ""
	}
	stored, err := backendauth.ReadAuthFile(path)
	if err != nil {
		return ""
	}
	credential, ok := stored["anthropic"]
	if !ok {
		return ""
	}
	if credential["type"] == "oauth" {
		return "Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage."
	}
	key, _ := credential["key"].(string)
	if strings.HasPrefix(key, "sk-ant-oat") {
		return "Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage."
	}
	return ""
}

func applyRuntimeQuota(ctx context.Context, root string, status *RuntimeStatus) {
	fiveHour, weekly := LiveQuotaForModel(ctx, status.Model)
	if fiveHour == nil && weekly == nil {
		fiveHour, weekly = RuntimeQuota(root)
	}
	status.FiveHourQuota = fiveHour
	status.WeeklyQuota = weekly
}
