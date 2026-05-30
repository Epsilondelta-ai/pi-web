package backend

import (
	"context"

	backendruntime "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/runtime"
)

type RuntimeStatus = backendruntime.RuntimeStatus
type WorkspaceModelsResponse = backendruntime.WorkspaceModelsResponse
type ModelProvider = backendruntime.ModelProvider
type ModelOption = backendruntime.ModelOption
type PiPackageUpdateDetector = backendruntime.PiPackageUpdateDetector
type PiPackageUpdateStatus = backendruntime.PiPackageUpdateStatus
type PiPackageUpdate = backendruntime.PiPackageUpdate
type PiUpdateRunner = backendruntime.PiUpdateRunner
type PiUpdater = backendruntime.PiUpdater
type latestPiVersionResponse = backendruntime.LatestPiVersionResponse

const (
	PiUpdateIdle     = backendruntime.PiUpdateIdle
	PiUpdateUpdating = backendruntime.PiUpdateUpdating
	PiUpdateUpdated  = backendruntime.PiUpdateUpdated
	PiUpdateFailed   = backendruntime.PiUpdateFailed
)

func WorkspaceModels(ctx context.Context, root string) (WorkspaceModelsResponse, error) {
	return backendruntime.WorkspaceModels(ctx, root)
}

func fallbackWorkspaceModels(root string, err error) WorkspaceModelsResponse {
	return backendruntime.FallbackWorkspaceModels(root, err)
}

func MockRuntimeStatus() RuntimeStatus      { return backendruntime.MockRuntimeStatus() }
func MockRuntimeModelStatus() RuntimeStatus { return backendruntime.MockRuntimeModelStatus() }
func MockRuntimeQuotaStatus() RuntimeStatus { return backendruntime.MockRuntimeQuotaStatus() }
func WorkspaceRuntimeStatus(ctx context.Context, root string) (RuntimeStatus, error) {
	return backendruntime.WorkspaceRuntimeStatus(ctx, root)
}
func WorkspaceRuntimeModelStatus(ctx context.Context, root string) (RuntimeStatus, error) {
	return backendruntime.WorkspaceRuntimeModelStatus(ctx, root)
}
func WorkspaceRuntimeQuotaStatus(ctx context.Context, root string, model string) RuntimeStatus {
	return backendruntime.WorkspaceRuntimeQuotaStatus(ctx, root, model)
}
func RuntimeModelStatusFromSettings(root string) (RuntimeStatus, error) {
	return backendruntime.RuntimeModelStatusFromSettings(root)
}
func MockPiVersionStatus() PiVersionStatus { return backendruntime.MockPiVersionStatus() }
func DetectPiVersionStatus(ctx context.Context) (PiVersionStatus, error) {
	return backendruntime.DetectPiVersionStatus(ctx)
}
func CurrentPiVersion(ctx context.Context) (string, error) {
	return backendruntime.CurrentPiVersion(ctx)
}
func LatestPiVersion(ctx context.Context, current string) (latestPiVersionResponse, error) {
	return backendruntime.LatestPiVersion(ctx, current)
}
func DetectGlobalPackageUpdates(ctx context.Context) (PiPackageUpdateStatus, error) {
	return backendruntime.DetectGlobalPackageUpdates(ctx)
}
func DetectWorkspacePackageUpdates(ctx context.Context, root string) (PiPackageUpdateStatus, error) {
	return backendruntime.DetectWorkspacePackageUpdates(ctx, root)
}
func CurrentPiModel(ctx context.Context, cwd string) (string, error) {
	return backendruntime.CurrentPiModel(ctx, cwd)
}
func CurrentPiModelStatus(ctx context.Context, cwd string) (RuntimeStatus, error) {
	return backendruntime.CurrentPiModelStatus(ctx, cwd)
}
func RuntimeQuota(model string) (*int, *int) { return backendruntime.RuntimeQuota(model) }
func LiveQuotaForModel(ctx context.Context, model string) (*int, *int) {
	return backendruntime.LiveQuotaForModel(ctx, model)
}
func NewPiUpdater(runner PiUpdateRunner) *PiUpdater { return backendruntime.NewPiUpdater(runner) }
func RunPiUpdateCommand(ctx context.Context, source string, workspaceDir string) error {
	return backendruntime.RunPiUpdateCommand(ctx, source, workspaceDir)
}

func parseListModelsOutput(output string) WorkspaceModelsResponse {
	return backendruntime.ParseListModelsOutput(output)
}
