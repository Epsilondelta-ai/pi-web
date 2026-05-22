package piweb

import "context"

type RuntimeStatus struct {
	Model         string `json:"model,omitempty"`
	FiveHourQuota *int   `json:"fiveHourQuota,omitempty"`
	WeeklyQuota   *int   `json:"weeklyQuota,omitempty"`
	CurrentBranch string `json:"currentBranch,omitempty"`
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
	status := RuntimeStatus{}
	if model, err := CurrentPiModel(ctx, root); err == nil {
		status.Model = model
	}
	if git, err := RealGitStatus(root); err == nil {
		status.CurrentBranch = git.Branch
	}
	return status, nil
}

func WorkspaceRuntimeQuotaStatus(ctx context.Context, root string, model string) RuntimeStatus {
	fiveHour, weekly := RuntimeQuota(root)
	if fiveHour == nil && weekly == nil {
		fiveHour, weekly = LiveQuotaForModel(ctx, model)
	}
	return RuntimeStatus{FiveHourQuota: fiveHour, WeeklyQuota: weekly}
}
