import {
  createSession,
  deleteSession as deleteSessionRequest,
  deleteWorkspaceSessions as deleteWorkspaceSessionsRequest,
  renameSession as renameSessionRequest,
} from "../api";
import { escapeHtml } from "../renderers";
import { clearStoredActiveSession, storeActiveSession } from "./session-storage";

export const sessionMethods = {
  createSessionRow(workspaceId, session) {
    const row = document.createElement("div");
    const menuId = `session-menu-${session.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    row.className = "session-row";
    row.dataset.session = session.id;
    row.dataset.workspace = workspaceId;
    row.dataset.title = session.title;
    row.innerHTML = this.sessionRowTemplate(workspaceId, session, menuId);
    row.querySelector(".title").textContent = session.title;
    row.dataset.lastUsed = session.lastUsed || "";
    row.querySelector(".meta").textContent = session.lastUsed;
    this.markSessionRunning(row, !!(session.active || session.live));
    this.markSessionSelected(row, session.id === this.dataset.activeSessionId);
    return row;
  },

  sessionRowTemplate(workspaceId, session, menuId) {
    return [
      `<button type="button" class="session-main"`,
      ` data-session="${escapeHtml(session.id)}"`,
      ` data-workspace="${escapeHtml(workspaceId)}"`,
      ` data-title="${escapeHtml(session.title)}">`,
      `<span class="gutter"><span class="dot"></span></span>`,
      `<span class="title"></span><span class="meta"></span></button>`,
      `<button type="button" class="session-menu-button" data-action="session-menu-toggle"`,
      ` aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}"`,
      ` aria-label="session actions">…</button>`,
      `<div class="session-menu" id="${menuId}" role="menu" hidden>`,
      `<button type="button" role="menuitem" data-action="rename-session">rename</button>`,
      `<button type="button" role="menuitem" class="danger" data-action="delete-session">delete</button>`,
      `</div>`,
    ].join("");
  },

  updateSessionTitle(session) {
    if (!session?.id) return;
    const row = this.querySelector(`[data-session='${session.id}']`);
    if (row) {
      row.dataset.title = session.title;
      const main = row.querySelector(".session-main");
      if (main) main.dataset.title = session.title;
      const title = row.querySelector(".title");
      if (title) title.textContent = session.title;
    }
    const activeTitle = this.querySelector("[data-active-session-title]");
    if (activeTitle && this.dataset.activeSessionId === session.id) {
      activeTitle.textContent = session.title;
      activeTitle.title = `${session.title} · ${session.id}`;
    }
  },

  autonameActiveSession(text) {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId || !text.trim()) return;
    const row = this.querySelector(`[data-session='${sessionId}']`);
    const current = row?.dataset.title?.trim();
    if (current && current !== "new session" && current !== "no session") return;
    const title = text.trim().replace(/\s+/g, " ").slice(0, 48) + (text.trim().length > 48 ? "…" : "");
    this.updateSessionTitle({ id: sessionId, title });
  },

  async pickSession(row) {
    this.dataset.activeSessionId = row.dataset.session;
    this.markSelectedSessionRow(row.dataset.session);
    this.activateWorkspaceForSession(row.dataset.workspace);
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = row.dataset.title;
      title.title = `${row.dataset.title} · ${row.dataset.session}`;
    }
    this.resetActiveSessionState();
    this.showSessionMain();
    this.toggleDrawer?.(false);
    if (this.apiConnected) await this.loadSession(row.dataset.session);
    else storeActiveSession(row.dataset.workspace, row.dataset.session);
    this.scrollTerm();
  },

  markSelectedSessionRow(sessionId) {
    this.querySelectorAll(".session-row[data-session]").forEach((row) => {
      this.markSessionSelected(row, row.dataset.session === sessionId);
    });
  },

  markSessionSelected(row, selected) {
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-current", selected ? "true" : "false");
  },

  markSessionRunning(row, running) {
    row.classList.toggle("active", running);
    row.querySelector(".meta")?.classList.toggle("live", running);
    row.querySelector(".gutter .dot")?.classList.toggle("live", running);
  },

  syncCurrentSessionRunState(running) {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId) return;
    const row = this.querySelector(`[data-session='${sessionId}']`);
    if (!row) return;
    this.markSessionRunning(row, running);
    const meta = row.querySelector(".meta");
    if (meta) meta.textContent = running ? "waiting" : row.dataset.lastUsed || "";
    this.syncActiveWorkspaceRows?.();
  },

  async renameSession(sessionId) {
    this.closeSessionMenus();
    if (!sessionId || !this.apiConnected) return;
    const current = this.querySelector(`[data-session='${sessionId}']`)?.dataset.title || "";
    const title = prompt("Rename session", current)?.trim();
    if (!title) return;
    try {
      const { session } = await renameSessionRequest(sessionId, title);
      const row = this.querySelector(`[data-session='${sessionId}']`);
      if (row) {
        row.dataset.title = session.title;
        const main = row.querySelector(".session-main");
        if (main) main.dataset.title = session.title;
        if (row.querySelector(".title")) row.querySelector(".title").textContent = session.title;
      }
      const activeTitle = this.querySelector("[data-active-session-title]");
      if (activeTitle && this.dataset.activeSessionId === sessionId) activeTitle.textContent = session.title;
    } catch {
      this.setConnection("err");
    }
  },

  async deleteSession(sessionId) {
    this.closeSessionMenus();
    if (!sessionId || !this.apiConnected) return;
    if (!confirm(`Delete session ${sessionId}? This removes the local JSONL file.`)) return;
    try {
      await deleteSessionRequest(sessionId);
      const workspaceId = this.findWorkspaceIdForSession(sessionId);
      this.querySelector(`[data-session='${sessionId}']`)?.remove();
      this.refreshWorkspaceSessionControls(workspaceId);
      if (this.dataset.activeSessionId === sessionId) this.clearActiveSession(sessionId);
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

  async newSession(workspace) {
    const workspaceId = workspace || this.dataset.activeWorkspaceId;
    if (workspaceId) this.activateWorkspaceForSession(workspaceId);
    if (this.apiConnected && workspaceId) {
      try {
        const { session } = await createSession(workspaceId);
        this.activateCreatedSession(workspaceId, session);
        this.route("workspace");
        this.showSessionMain();
        return;
      } catch {
        this.setConnection("err");
      }
    }
    this.showEmptyMain();
    const label = this.querySelector(`[data-workspace='${workspaceId}'] .label`)?.textContent
      || workspaceId
      || "workspace";
    const empty = this.querySelector("[data-empty-workspace]");
    const title = this.querySelector("[data-active-session-title]");
    if (empty) empty.textContent = label;
    if (title && !this.dataset.activeSessionId) title.textContent = "new session";
  },

  activateCreatedSession(workspaceId, session) {
    this.dataset.activeSessionId = session.id;
    this.activateWorkspaceForSession(workspaceId, { loadContext: true, forceLoadContext: true });
    this.resetActiveSessionState();
    storeActiveSession(workspaceId, session.id);
    this.markSelectedSessionRow(session.id);
    const group = this.querySelector(`[data-workspace-group='${workspaceId}'] .sessions`);
    if (group && !group.querySelector(`[data-session='${session.id}']`)) {
      group.insertBefore(this.createSessionRow(workspaceId, session), group.querySelector(".new-session-row"));
    }
    this.refreshWorkspaceSessionControls(workspaceId);
    this.markSelectedSessionRow(session.id);
    this.syncActiveWorkspaceRows?.();
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = session.title;
      title.title = `${session.title} · ${session.id}`;
    }
    this.renderMessages([]);
    this.connectEvents(session.id);
  },

  resetActiveSessionState() {
    this.running = false;
    this.piDeltaBuffer = "";
    this.removeLoadingMessage?.();
    this.stopButton?.setAttribute("hidden", "");
    this.updatePrompt?.();
  },

  showSessionMain() {
    this.dataset.session = "active";
    this.querySelector("[data-main='session']")?.removeAttribute("hidden");
    this.querySelector("[data-main='empty']")?.setAttribute("hidden", "");
    this.scrollTerm();
  },

  showEmptyMain() {
    this.dataset.session = "empty";
    this.querySelector("[data-main='session']")?.setAttribute("hidden", "");
    this.querySelector("[data-main='empty']")?.removeAttribute("hidden");
  },

  toggleSessionMenu(row) {
    if (!row) return;
    const menu = row.querySelector(".session-menu");
    const button = row.querySelector(".session-menu-button");
    const open = menu?.hidden;
    this.closeSessionMenus(row);
    menu?.toggleAttribute("hidden", !open);
    button?.setAttribute("aria-expanded", String(!!open));
  },

  closeSessionMenus(except) {
    this.querySelectorAll(".session-row").forEach((row) => {
      if (except && row === except) return;
      row.querySelector(".session-menu")?.setAttribute("hidden", "");
      row.querySelector(".session-menu-button")?.setAttribute("aria-expanded", "false");
    });
  },

  closeModals() {
    this.closeSessionMenus();
    this.closeFilePreview?.();
    this.closeSettingsModal?.();
  },
};
