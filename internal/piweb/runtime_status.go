package piweb

import (
	"context"
	"strings"
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
	status := MockRuntimeModelStatus()
	quota := MockRuntimeQuotaStatus()
	status.FiveHourQuota = quota.FiveHourQuota
	status.WeeklyQuota = quota.WeeklyQuota
	return status
}

func MockRuntimeModelStatus() RuntimeStatus {
	return RuntimeStatus{Model: "GPT-5.5", CurrentBranch: "main"}
}

func MockRuntimeQuotaStatus() RuntimeStatus {
	fiveHour := 84
	weekly := 14
	return RuntimeStatus{FiveHourQuota: &fiveHour, WeeklyQuota: &weekly}
}

func WorkspaceRuntimeStatus(ctx context.Context, root string) (RuntimeStatus, error) {
	status, err := WorkspaceRuntimeModelStatus(ctx, root)
	if err != nil {
		return status, err
	}
	quota := WorkspaceRuntimeQuotaStatus(ctx, root, status.Model)
	status.FiveHourQuota = quota.FiveHourQuota
	status.WeeklyQuota = quota.WeeklyQuota
	return status, nil
}

func WorkspaceRuntimeModelStatus(ctx context.Context, root string) (RuntimeStatus, error) {
	status, err := CurrentPiModelStatus(ctx, root)
	if err != nil {
		status = RuntimeStatus{}
		if warning := runtimeAuthWarning(err); warning != "" {
			status.Warning = warning
		}
	}
	if status.Warning == "" {
		status.Warning = anthropicSubscriptionAuthWarning(status)
	}
	if git, err := RealGitStatus(root); err == nil {
		status.CurrentBranch = git.Branch
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
	path, err := authPath()
	if err != nil {
		return ""
	}
	stored, err := readAuthFile(path)
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

func WorkspaceRuntimeQuotaStatus(ctx context.Context, root string, model string) RuntimeStatus {
	fiveHour, weekly := LiveQuotaForModel(ctx, model)
	if fiveHour == nil && weekly == nil {
		fiveHour, weekly = RuntimeQuota(root)
	}
	return RuntimeStatus{FiveHourQuota: fiveHour, WeeklyQuota: weekly}
}
