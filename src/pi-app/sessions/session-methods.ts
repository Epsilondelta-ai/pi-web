import {
  createSession,
  renameSession as renameSessionRequest,
} from "../../lib/api";
import { escapeHtml } from "../../lib/renderers";
import { sessionDeleteMethods } from "./session-delete-methods";
import { decorateSessionRow, sessionKindLabel } from "./session-hierarchy";
import { sessionMenuMethods } from "./session-menu-methods";
import { storeActiveSession } from "./session-storage";

const LUCIDE_ELLIPSIS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>`;
const LUCIDE_PENCIL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>`;
const LUCIDE_TRASH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

export const sessionMethods = {
  createSessionRow(workspaceId, session) {
    const row = document.createElement("div");
    const menuId = `session-menu-${session.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    row.className = "session-row";
    decorateSessionRow(row, session);
    row.dataset.session = session.id;
    row.dataset.workspace = workspaceId;
    row.dataset.title = session.title;
    row.innerHTML = this.sessionRowTemplate(workspaceId, session, menuId);
    row.querySelector(".title").textContent = session.title;
    row.dataset.lastUsed = session.lastUsed || "";
    this.updateSessionMeta(row, !!(session.active || session.live));
    this.markSessionRunning(row, !!(session.active || session.live));
    this.markSessionSelected(row, session.id === this.dataset.activeSessionId);
    row.classList.toggle("unread-completed", this.readUnreadCompletedSessions?.().has(session.id));
    return row;
  },

  sessionRowTemplate(workspaceId, session, menuId) {
    return [
      `<button type="button" class="session-main"`,
      ` data-session="${escapeHtml(session.id)}"`,
      ` data-workspace="${escapeHtml(workspaceId)}"`,
      ` data-title="${escapeHtml(session.title)}">`,
      `<span class="session-title"><span class="title"></span>${this.sessionKindBadge(session)}</span>`,
      `<span class="meta"></span></button>`,
      `<button type="button" class="session-menu-button" data-action="session-menu-toggle"`,
      ` aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}"`,
      ` aria-label="session actions">${LUCIDE_ELLIPSIS_ICON}</button>`,
      `<div class="session-menu" id="${menuId}" role="menu" hidden>`,
      `<button type="button" role="menuitem" data-action="rename-session">${LUCIDE_PENCIL_ICON}<span>rename</span></button>`,
      `<button type="button" role="menuitem" class="danger" data-action="delete-session">${LUCIDE_TRASH_ICON}<span>delete</span></button>`,
      `</div>`,
    ].join("");
  },

  sessionKindBadge(session) {
    const label = sessionKindLabel(session);
    return label ? `<span class="session-kind-badge">${label}</span>` : "";
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
    this.clearUnreadCompletedSession?.(row.dataset.session);
    this.dataset.activeSessionId = row.dataset.session;
    this.markSelectedSessionRow(row.dataset.session);
    this.activateWorkspaceForSession(row.dataset.workspace, { loadContext: true, forceLoadContext: true });
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
  },

  updateSessionMeta(row, running) {
    const meta = row.querySelector(".meta");
    if (!meta) return;
    meta.textContent = running ? "waiting" : "";
    meta.toggleAttribute("hidden", !running);
  },

  syncCurrentSessionRunState(running) {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId) return;
    const row = this.querySelector(`[data-session='${sessionId}']`);
    if (!row) return;
    this.markSessionRunning(row, running);
    this.updateSessionMeta(row, running);
    this.syncActiveWorkspaceRows?.();
    this.syncBackgroundSessionWatches?.();
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

  ...sessionDeleteMethods,

  async newSession(workspace) {
    const workspaceId = workspace || this.dataset.activeWorkspaceId;
    if (workspaceId) this.activateWorkspaceForSession(workspaceId);
    if (this.apiConnected && workspaceId) {
      try {
        const { session } = await createSession(workspaceId);
        this.activateCreatedSession(workspaceId, session);
        this.route("workspace");
        this.showEmptyMain(workspaceId);
        return;
      } catch {
        this.setConnection("err");
      }
    }
    this.showEmptyMain(workspaceId);
  },

  updateEmptySessionWorkspaceLabel(workspaceId) {
    const label = this.querySelector(`[data-workspace='${workspaceId}'] .label`)?.textContent
      || workspaceId
      || "pi-web";
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
    this.addWorkspaceSessionToState(workspaceId, session);
    if (!this.sidebarSortableRoot) {
      const group = this.querySelector(`[data-workspace-group='${workspaceId}'] .sessions`);
      if (group && !group.querySelector(`[data-session='${session.id}']`)) {
        group.insertBefore(this.createSessionRow(workspaceId, session), group.querySelector(".new-session-row"));
      }
      this.refreshWorkspaceSessionControls(workspaceId);
    }
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

  addWorkspaceSessionToState(workspaceId, session) {
    if (!workspaceId || !session?.id || !Array.isArray(this.workspaceList)) return;
    const nextWorkspaces = this.workspaceList.map((workspace) => {
      if (workspace.id !== workspaceId) return workspace;
      const sessions = (workspace.sessions || []).filter((item) => item.id !== session.id);
      const nextSessions = [session, ...sessions];
      return {
        ...workspace,
        sessions: nextSessions,
        sessionCount: nextSessions.length,
        live: nextSessions.some((item) => item.active || item.live),
      };
    });
    this.renderWorkspaces(nextWorkspaces);
    this.openActiveWorkspaceGroup(workspaceId);
  },

  resetActiveSessionState() {
    this.running = false;
    this.piDeltaBuffer = "";
    this.syncBackgroundSessionWatches?.();
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

  showEmptyMain(workspaceId = this.dataset.activeWorkspaceId || "") {
    this.dataset.session = "empty";
    this.updateEmptySessionWorkspaceLabel(workspaceId);
    this.querySelector("[data-main='session']")?.setAttribute("hidden", "");
    this.querySelector("[data-main='empty']")?.removeAttribute("hidden");
  },

  ...sessionMenuMethods,
};
