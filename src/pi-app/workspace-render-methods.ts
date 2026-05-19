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
    group.innerHTML = this.workspaceGroupTemplate(workspace, open);
    this.fillWorkspaceGroup(group, workspace);
    return group;
  },

  workspaceGroupTemplate(workspace, open) {
    return [
      "<div class=\"workspace-shell\">",
      `<button type="button" class="ws-row ${open ? "open" : ""}"`,
      ` data-action="toggle-workspace" data-workspace="${escapeHtml(workspace.id)}"`,
      ` aria-expanded="${open}">`,
      `<span class="caret">${open ? "▾" : "▸"}</span>`,
      "<span class=\"ws-stack\"><span class=\"ws-name\"><span class=\"dot\"></span>",
      "<span class=\"label\"></span></span><span class=\"ws-path\"></span></span>",
      `<span class="ws-meta">${workspace.sessionCount}</span></button>`,
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
    sessions.append(this.createNewSessionRow(workspace.id));
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
    this.querySelectorAll("[data-workspace-group]").forEach((group) => {
      const sessions = group.querySelector(".sessions");
      const row = group.querySelector(".ws-row");
      const open = group.dataset.workspaceGroup === id && sessions?.hidden;
      if (sessions) sessions.hidden = !open;
      row?.classList.toggle("open", open);
      row?.setAttribute("aria-expanded", String(open));
      const caret = row?.querySelector(".caret");
      if (caret) caret.textContent = open ? "▾" : "▸";
    });
  },
};
