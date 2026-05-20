import { escapeHtml } from "../renderers";

export const workspaceRenderMethods = {
  renderWorkspaces(workspaces) {
    const count = this.querySelector("[data-workspace-count]");
    if (count) count.textContent = `${workspaces.length} known`;
    this.renderRecentWorkspaces(workspaces);
    this.renderSidebarWorkspaces(workspaces);
  },

  renderRecentWorkspaces(workspaces) {
    const recentCard = this.querySelector("[data-recent-workspaces]");
    if (!recentCard) return;
    recentCard.querySelectorAll(".recent-row").forEach((row) => row.remove());
    for (const workspace of workspaces.slice(0, 4)) recentCard.append(this.createRecentWorkspace(workspace));
  },

  renderSidebarWorkspaces(workspaces) {
    const section = this.querySelector(".sidebar .sb-section");
    if (!section) return;
    section.querySelectorAll(".workspace-group").forEach((group) => group.remove());
    let anchor = section.querySelector(".sb-head");
    for (const workspace of workspaces) {
      const group = this.createWorkspaceGroup(workspace);
      anchor.insertAdjacentElement("afterend", group);
      anchor = group;
    }
  },

  createRecentWorkspace(workspace) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "recent-row";
    row.dataset.workspace = workspace.id;
    row.setAttribute("aria-label", `open ${workspace.name}`);
    row.innerHTML = [
      "<span class=\"glyph\">▸</span>",
      "<span class=\"ws-info\"><span class=\"name\"></span><span class=\"path\"></span></span>",
      "<span class=\"ws-stat\"></span>",
      "<span class=\"open-cta\">open ↵</span>",
    ].join("");
    row.querySelector(".name").textContent = workspace.name;
    row.querySelector(".path").textContent = workspace.path;
    row.querySelector(".ws-stat").innerHTML = this.workspaceRecentStatus(workspace);
    return row;
  },

  workspaceRecentStatus(workspace) {
    if (workspace.live) {
      return `<span class="live">● live</span><span class="lbl">${workspace.sessionCount} sessions</span>`;
    }
    const lastUsed = escapeHtml(workspace.lastUsed || "—");
    return `<span>${lastUsed}</span><span class="lbl">${workspace.sessionCount} sessions</span>`;
  },

  createWorkspaceGroup(workspace) {
    const group = document.createElement("div");
    group.className = "workspace-group";
    group.dataset.workspaceGroup = workspace.id;
    const open = workspace.id === this.dataset.activeWorkspaceId;
    group.classList.toggle("active", open);
    group.classList.toggle("has-active-session", this.workspaceHasActiveSession(workspace));
    group.innerHTML = this.workspaceGroupTemplate(workspace, open);
    this.fillWorkspaceGroup(group, workspace);
    return group;
  },

  workspaceHasActiveSession(workspace) {
    return (workspace.sessions || []).some((session) => (
      session.active || session.live || session.id === this.dataset.activeSessionId
    ));
  },

  workspaceGroupTemplate(workspace, open) {
    const active = workspace.id === this.dataset.activeWorkspaceId;
    const hasActiveSession = this.workspaceHasActiveSession(workspace);
    const stateClasses = [open && "open", active && "active", hasActiveSession && "has-active-session"]
      .filter(Boolean)
      .join(" ");
    return [
      "<div class=\"workspace-shell\">",
      `<button type="button" class="ws-row ${stateClasses}"`,
      ` data-action="toggle-workspace" data-workspace="${escapeHtml(workspace.id)}"`,
      ` aria-expanded="${open}" aria-current="${active ? "true" : "false"}">`,
      `<span class="caret">${open ? "▾" : "▸"}</span>`,
      "<span class=\"ws-stack\"><span class=\"ws-name\"><span class=\"dot\"></span>",
      "<span class=\"label\"></span></span><span class=\"ws-path\"></span></span>",
      `<span class="ws-meta"><span class="ws-count">${workspace.sessionCount}</span>`,
      `<span class="ws-active-badge"${hasActiveSession ? "" : " hidden"}>active</span></span></button>`,
      `<button type="button" class="row-action danger" data-action="delete-workspace"`,
      ` data-workspace="${escapeHtml(workspace.id)}" title="remove workspace">×</button>`,
      `</div><div class="sessions"${open ? "" : " hidden"}></div>`,
    ].join("");
  },

  fillWorkspaceGroup(group, workspace) {
    group.querySelector(".label").textContent = workspace.name;
    group.querySelector(".ws-path").textContent = workspace.path;
    group.querySelector(".dot").classList.toggle("live", !!workspace.live);
    const sessions = group.querySelector(".sessions");
    for (const session of workspace.sessions || []) sessions.append(this.createSessionRow(workspace.id, session));
    if ((workspace.sessions || []).length > 0) sessions.append(this.createDeleteWorkspaceSessionsRow(workspace.id));
    sessions.append(this.createNewSessionRow(workspace.id));
  },

  createDeleteWorkspaceSessionsRow(workspaceId) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "session-row clear-sessions-row";
    row.dataset.action = "delete-workspace-sessions";
    row.dataset.workspace = workspaceId;
    row.innerHTML = `<span class="title">delete all sessions</span>`;
    return row;
  },

  createNewSessionRow(workspaceId) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "session-row new-session-row";
    row.dataset.action = "new-session";
    row.dataset.workspace = workspaceId;
    row.innerHTML = `<span class="title">+ new session</span>`;
    return row;
  },

  toggleWorkspace(id) {
    const targetSessions = this.findWorkspaceGroup?.(id)?.querySelector(".sessions");
    const shouldOpen = !!targetSessions?.hidden;
    this.activateWorkspaceForSession(id);
    this.querySelectorAll("[data-workspace-group]").forEach((group) => {
      const sessions = group.querySelector(".sessions");
      const row = group.querySelector(".ws-row");
      const open = group.dataset.workspaceGroup === id ? shouldOpen : false;
      if (sessions) sessions.hidden = !open;
      row?.classList.toggle("open", open);
      row?.setAttribute("aria-expanded", String(open));
      const caret = row?.querySelector(".caret");
      if (caret) caret.textContent = open ? "▾" : "▸";
    });
    this.syncActiveWorkspaceRows();
  },

  syncActiveWorkspaceRows() {
    const activeWorkspaceId = this.dataset.activeWorkspaceId;
    const activeSessionId = this.dataset.activeSessionId;
    this.querySelectorAll("[data-workspace-group]").forEach((group) => {
      const row = group.querySelector(".ws-row");
      const active = group.dataset.workspaceGroup === activeWorkspaceId;
      const hasSelectedSession = activeSessionId && group.querySelector(`[data-session='${activeSessionId}']`);
      const hasLiveSession = group.querySelector(".session-row .dot.live");
      const hasActiveSession = active || !!hasSelectedSession || !!hasLiveSession;
      group.classList.toggle("active", active);
      group.classList.toggle("has-active-session", hasActiveSession);
      row?.classList.toggle("active", active);
      row?.classList.toggle("has-active-session", hasActiveSession);
      row?.setAttribute("aria-current", active ? "true" : "false");
      row?.querySelector(".ws-active-badge")?.toggleAttribute("hidden", !hasActiveSession);
    });
  },
};
