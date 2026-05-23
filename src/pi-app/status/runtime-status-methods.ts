import { getWorkspaceRuntimeModel, getWorkspaceRuntimeQuota, getWorkspaceRuntimeStatus } from "../../lib/api";

export const runtimeStatusMethods = {
  async loadRuntimeStatus(workspaceId = this.dataset.activeWorkspaceId) {
    if (!workspaceId || !this.apiConnected) return;
    try {
      const { status } = await getWorkspaceRuntimeModel(workspaceId);
      this.applyRuntimeStatus(status);
      void this.loadRuntimeQuota(workspaceId, status?.model);
    } catch {
      try {
        const { status } = await getWorkspaceRuntimeStatus(workspaceId);
        this.applyRuntimeStatus(status);
      } catch {}
    }
  },

  async loadRuntimeQuota(workspaceId = this.dataset.activeWorkspaceId, model = this.runtimeStatus?.model) {
    if (!workspaceId || !this.apiConnected) return;
    try {
      const { status } = await getWorkspaceRuntimeQuota(workspaceId, model || "");
      this.applyRuntimeStatus(status);
    } catch {}
  },

  applyRuntimeStatus(status) {
    if (!status) return;
    this.updatePromptMeta(status);
    if (status.warning) this.notifyRuntimeWarning?.(status.warning);
  },
};
