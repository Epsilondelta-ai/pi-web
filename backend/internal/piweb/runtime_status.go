package piweb

import "context"

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
