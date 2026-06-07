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

  deletedSessionIdsWithDescendants(workspaceId, sessionId) {
    const sessions = Array.isArray(this.workspaceList)
      ? this.workspaceList.find((workspace) => workspace.id === workspaceId)?.sessions
      : null;
    if (Array.isArray(sessions)) return this.deletedSessionIdsFromList(sessions, sessionId);
    return this.deletedSessionIdsFromRows(sessionId);
  },

  deletedSessionIdsFromList(sessions, sessionId) {
    const deletedSessionIds = new Set([sessionId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const session of sessions || []) {
        if (deletedSessionIds.has(session.id) || !deletedSessionIds.has(session.parentId)) continue;
        deletedSessionIds.add(session.id);
        changed = true;
      }
    }
    return deletedSessionIds;
  },

  deletedSessionIdsFromRows(sessionId) {
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
    return deletedSessionIds;
  },

  removeSessionRows(deletedSessionIds) {
    deletedSessionIds?.forEach((id) => this.querySelector(`.session-row[data-session='${id}']`)?.remove());
  },

  removeSessionRowsWithDescendants(sessionId) {
    const deletedSessionIds = this.deletedSessionIdsFromRows(sessionId);
    this.removeSessionRows(deletedSessionIds);
    return deletedSessionIds;
  },

  clearWorkspaceSessionRows(workspaceId) {
    const groups = this.workspaceGroups(workspaceId);
    groups.forEach((group) => {
      const sessions = group.querySelector(".sessions");
      sessions?.querySelectorAll(".session-row[data-session], .session-sortable, .sessions-empty").forEach((row) => row.remove());
    });
    this.refreshWorkspaceSessionControls(workspaceId);
  },

  workspaceSessionIds(workspaceId) {
    return new Set([
      ...this.querySelectorAll(`[data-workspace-group='${workspaceId}'] .session-row[data-session]`),
    ].map((row) => row.dataset.session).filter(Boolean));
  },

  removeWorkspaceSessionsFromState(workspaceId, deletedSessionIds) {
    if (!workspaceId || !deletedSessionIds?.size || !Array.isArray(this.workspaceList)) return;
    const nextSessions = (this.workspaceList.find((workspace) => workspace.id === workspaceId)?.sessions || [])
      .filter((session) => !deletedSessionIds.has(session.id));
    this.replaceWorkspaceSessionsInState(workspaceId, nextSessions);
  },

  replaceWorkspaceSessionsInState(workspaceId, sessions) {
    if (!workspaceId || !Array.isArray(this.workspaceList)) return;
    const nextWorkspaces = this.workspaceList.map((workspace) => {
      if (workspace.id !== workspaceId) return workspace;
      const nextSessions = sessions || [];
      return {
        ...workspace,
        sessions: nextSessions,
        sessionCount: nextSessions.length,
        live: nextSessions.some((session) => session.active || session.live),
      };
    });
    this.renderWorkspaces(nextWorkspaces);
    if (this.dataset.activeWorkspaceId) this.openActiveWorkspaceGroup(this.dataset.activeWorkspaceId);
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

  workspaceGroups(workspaceId) {
    return [...this.querySelectorAll(`[data-workspace-group='${workspaceId}']`)];
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
