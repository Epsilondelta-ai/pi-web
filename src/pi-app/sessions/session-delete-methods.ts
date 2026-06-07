import { clearStoredActiveSession } from "./session-storage";

export const sessionDeleteMethods = {
  clearActiveSession(sessionId) {
    clearStoredActiveSession(sessionId);
    this.eventSource?.close();
    this.eventStreamId = undefined;
    this.dataset.activeSessionId = "";
    this.resetActiveSessionState();
    this.renderMessages([]);
    this.showEmptyMain();
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = "no session";
      title.title = "no session";
    }
  },

  refreshWorkspaceSessionControls(workspaceId) {
    const group = this.findWorkspaceGroup?.(workspaceId)
      || this.querySelector(`[data-workspace-group='${workspaceId}']`);
    if (!group) return;
    const sessions = group.querySelector(".sessions");
    const count = this.countWorkspaceSessions(workspaceId);
    const countLabel = group.querySelector(".ws-count") || group.querySelector(".ws-meta");
    if (countLabel) countLabel.textContent = String(count);
    sessions?.querySelector(".sessions-empty")?.remove();
    const newSessionRow = sessions?.querySelector(".new-session-row");
    if (sessions && newSessionRow && count === 0) {
      sessions.insertBefore(this.createEmptySessionsRow(), newSessionRow);
    }
  },

  countWorkspaceSessions(workspaceId) {
    return this.querySelectorAll(
      `[data-workspace-group='${workspaceId}'] > .sessions .session-row[data-session]`,
    ).length;
  },

  findWorkspaceIdForSession(sessionId) {
    return this.querySelector(`[data-session='${sessionId}']`)?.dataset.workspace;
  },
};
