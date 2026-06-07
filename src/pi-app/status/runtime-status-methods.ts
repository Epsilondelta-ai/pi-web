import { getWorkspaceRuntimeStatus } from "../../shared/api/api";

export const runtimeStatusMethods = {
  async loadRuntimeStatus(workspaceId = this.dataset.activeWorkspaceId) {
    if (!workspaceId || !this.apiConnected) return;
    try {
      const { status } = await getWorkspaceRuntimeStatus(workspaceId);
      this.applyRuntimeStatus(status);
    } catch {}
  },

  applyRuntimeStatus(status) {
    if (!status) return;
    this.updatePromptMeta(status);
    if (status.warning) this.notifyRuntimeWarning?.(status.warning);
  },
};
