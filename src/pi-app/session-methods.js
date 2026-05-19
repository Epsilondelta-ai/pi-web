import { createSession, deleteSession as deleteSessionRequest, renameSession as renameSessionRequest } from "../api.js";
import { escapeHtml } from "../renderers.js";

export const sessionMethods = {
  createSessionRow(workspaceId, session) {
    const row = document.createElement("div");
    const menuId = `session-menu-${session.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    row.className = "session-row";
    row.dataset.session = session.id;
    row.dataset.workspace = workspaceId;
    row.dataset.title = session.title;
    row.innerHTML = `<button type="button" class="session-main" data-session="${escapeHtml(session.id)}" data-workspace="${escapeHtml(workspaceId)}" data-title="${escapeHtml(session.title)}"><span class="gutter"></span><span class="title"></span><span class="meta"></span></button><button type="button" class="session-menu-button" data-action="session-menu-toggle" aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}" aria-label="session actions">…</button><div class="session-menu" id="${menuId}" role="menu" hidden><button type="button" role="menuitem" data-action="rename-session">rename</button><button type="button" role="menuitem" class="danger" data-action="delete-session">delete</button></div>`;
    row.querySelector(".title").textContent = session.title;
    row.querySelector(".meta").textContent = session.lastUsed;
    row.querySelector(".meta").classList.toggle("live", !!session.live);
    row.classList.toggle("active", session.active || session.id === this.dataset.activeSessionId);
    return row;
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
    this.querySelectorAll(".session-row.active").forEach((item) => item.classList.remove("active"));
    row.classList.add("active");
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = row.dataset.title;
      title.title = `${row.dataset.title} · ${row.dataset.session}`;
    }
    this.showSessionMain();
    this.querySelector(".app-body")?.classList.remove("drawer-open");
    if (this.apiConnected) await this.loadSession(row.dataset.session);
    else this.dataset.activeSessionId = row.dataset.session;
    this.scrollTerm();
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
      this.querySelector(`[data-session='${sessionId}']`)?.remove();
      if (this.dataset.activeSessionId === sessionId) {
        this.dataset.activeSessionId = "";
        this.renderMessages([]);
        this.showEmptyMain();
        this.querySelector("[data-active-session-title]").textContent = "no session";
      }
    } catch {
      this.setConnection("err");
    }
  },

  async newSession(workspace) {
    const workspaceId = workspace || this.dataset.activeWorkspaceId;
    if (this.apiConnected && workspaceId) {
      try {
        const { session } = await createSession(workspaceId);
        this.activateCreatedSession(workspaceId, session);
      } catch {
        this.setConnection("err");
      }
    }
    this.showEmptyMain();
    const label = this.querySelector(`[data-workspace='${workspaceId}'] .label`)?.textContent || workspaceId || "workspace";
    const empty = this.querySelector("[data-empty-workspace]");
    const title = this.querySelector("[data-active-session-title]");
    if (empty) empty.textContent = label;
    if (title && !this.dataset.activeSessionId) title.textContent = "new session";
  },

  activateCreatedSession(workspaceId, session) {
    this.dataset.activeSessionId = session.id;
    this.querySelectorAll(".session-row.active").forEach((row) => row.classList.remove("active"));
    const group = this.querySelector(`[data-workspace-group='${workspaceId}'] .sessions`);
    if (group && !group.querySelector(`[data-session='${session.id}']`)) {
      group.insertBefore(this.createSessionRow(workspaceId, session), group.querySelector(".new-session-row"));
    }
    group?.querySelector(`[data-session='${session.id}']`)?.classList.add("active");
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = session.title;
      title.title = `${session.title} · ${session.id}`;
    }
    this.renderMessages([]);
    this.connectEvents(session.id);
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
  },
};
