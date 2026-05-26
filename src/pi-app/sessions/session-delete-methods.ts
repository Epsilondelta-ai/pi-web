import {
  deleteSession as deleteSessionRequest,
  deleteWorkspaceSessions as deleteWorkspaceSessionsRequest,
} from "../../lib/api";
import { clearStoredActiveSession } from "./session-storage";

export const sessionDeleteMethods = {
  async deleteSession(sessionId) {
    this.closeSessionMenus();
    if (!sessionId || !this.apiConnected) return;
    if (!confirm(`Delete session ${sessionId}? This removes the local JSONL file.`)) return;
    try {
      await deleteSessionRequest(sessionId);
      const workspaceId = this.findWorkspaceIdForSession(sessionId);
      const deletedSessionIds = this.removeSessionRowsWithDescendants(sessionId);
      this.refreshWorkspaceSessionControls(workspaceId);
      if (deletedSessionIds.has(this.dataset.activeSessionId)) this.clearActiveSession(this.dataset.activeSessionId);
    } catch {
      this.setConnection("err");
    }
  },

  async deleteWorkspaceSessions(workspaceId) {
    this.closeSessionMenus();
    if (!workspaceId || !this.apiConnected) return;
    const count = this.countWorkspaceSessions(workspaceId);
    const suffix = count ? ` (${count} shown)` : "";
    if (!confirm(`Delete all sessions in this workspace${suffix}? This removes local JSONL files.`)) return;
    try {
      await deleteWorkspaceSessionsRequest(workspaceId);
      this.clearWorkspaceSessionRows(workspaceId);
      if (workspaceId === this.dataset.activeWorkspaceId && this.dataset.activeSessionId) {
        this.clearActiveSession(this.dataset.activeSessionId);
      }
    } catch {
      this.setConnection("err");
    }
  },

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

  removeSessionRowsWithDescendants(sessionId) {
    const deletedSessionIds = new Set([sessionId]);
    let changed = true;
    while (changed) {
      changed = false;
      this.querySelectorAll(".session-row[data-session][data-parent-session]").forEach((row) => {
        if (deletedSessionIds.has(row.dataset.session) || !deletedSessionIds.has(row.dataset.parentSession)) return;
        deletedSessionIds.add(row.dataset.session);
        changed = true;
      });
    }
    deletedSessionIds.forEach((id) => this.querySelector(`[data-session='${id}']`)?.remove());
    return deletedSessionIds;
  },

  clearWorkspaceSessionRows(workspaceId) {
    const group = this.findWorkspaceGroup?.(workspaceId)
      || this.querySelector(`[data-workspace-group='${workspaceId}']`);
    group?.querySelectorAll(":scope > .sessions > .session-row[data-session]").forEach((row) => row.remove());
    this.refreshWorkspaceSessionControls(workspaceId);
  },

  refreshWorkspaceSessionControls(workspaceId) {
    const group = this.findWorkspaceGroup?.(workspaceId)
      || this.querySelector(`[data-workspace-group='${workspaceId}']`);
    if (!group) return;
    const sessions = group.querySelector(".sessions");
    const count = this.countWorkspaceSessions(workspaceId);
    const countLabel = group.querySelector(".ws-count") || group.querySelector(".ws-meta");
    if (countLabel) countLabel.textContent = String(count);
    sessions?.querySelector("[data-action='delete-workspace-sessions']")?.remove();
    const newSessionRow = sessions?.querySelector(".new-session-row");
    if (sessions && newSessionRow && count > 0) {
      sessions.insertBefore(this.createDeleteWorkspaceSessionsRow(workspaceId), newSessionRow);
    }
  },

  countWorkspaceSessions(workspaceId) {
    return this.querySelectorAll(
      `[data-workspace-group='${workspaceId}'] > .sessions > .session-row[data-session]`,
    ).length;
  },

  findWorkspaceIdForSession(sessionId) {
    return this.querySelector(`[data-session='${sessionId}']`)?.dataset.workspace;
  },
};
