import { getWorkspaceRuntimeModel, getWorkspaceRuntimeQuota, getWorkspaceRuntimeStatus } from "../../lib/api";

export const runtimeStatusMethods = {
  async loadRuntimeStatus(workspaceId = this.dataset.activeWorkspaceId) {
    if (!workspaceId || !this.apiConnected) return;
    try {
      const { status } = await getWorkspaceRuntimeModel(workspaceId);
      if (status) this.updatePromptMeta(status);
      void this.loadRuntimeQuota(workspaceId, status?.model);
    } catch {
      try {
        const { status } = await getWorkspaceRuntimeStatus(workspaceId);
        if (status) this.updatePromptMeta(status);
      } catch {}
    }
  },

  async loadRuntimeQuota(workspaceId = this.dataset.activeWorkspaceId, model = this.runtimeStatus?.model) {
    if (!workspaceId || !this.apiConnected) return;
    try {
      const { status } = await getWorkspaceRuntimeQuota(workspaceId, model || "");
      if (status) this.updatePromptMeta(status);
    } catch {}
  },
};
