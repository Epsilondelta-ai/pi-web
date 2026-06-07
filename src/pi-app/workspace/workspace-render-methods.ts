import { escapeHtml } from "../../shared/renderers/renderers";
import { appendGroupedSessionRows } from "../sessions/session-hierarchy";
import { applyStoredWorkspaceOrder, storeSessionOrder, storeWorkspaceOrder } from "./workspace-order";

const LUCIDE_PLUS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>`;
const LUCIDE_X_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
const LUCIDE_CORNER_DOWN_LEFT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4v7a4 4 0 0 1-4 4H4"></path><path d="m9 10-5 5 5 5"></path></svg>`;
const LUCIDE_CHEVRON_RIGHT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`;

export const workspaceRenderMethods = {
  renderWorkspaces(workspaces) {
    const orderedWorkspaces = applyStoredWorkspaceOrder(workspaces || []);
    this.workspaceList = orderedWorkspaces;
    const count = this.querySelector("[data-workspace-count]");
    if (count) count.textContent = `${orderedWorkspaces.length} known`;
    this.renderRecentWorkspaces(orderedWorkspaces);
    this.renderSidebarWorkspaces(orderedWorkspaces);
    this.syncUnreadCompletedSessions?.();
    this.syncBackgroundSessionWatches?.();
    this.syncAgentSessionStatusPolling?.();
  },

  renderRecentWorkspaces(workspaces) {
    const recentCard = this.querySelector("[data-recent-workspaces]");
    if (!recentCard) return;
    recentCard.querySelectorAll(".recent-row").forEach((row) => row.remove());
    for (const workspace of workspaces.slice(0, 4)) recentCard.append(this.createRecentWorkspace(workspace));
  },

  renderSidebarWorkspaces(workspaces) {
    // Compatibility renderer for external left-sidebar plugins that reuse host workspace/session behavior.
    const section = this.querySelector(".sidebar .sb-section");
    if (!section) return;
    if (this.sidebarSortableRoot && section.querySelector("[data-sortable-workspaces]")) {
      void this.renderSortableSidebarWorkspaces(section, workspaces);
      return;
    }
    section.querySelectorAll(":scope > .workspace-group").forEach((group) => group.remove());
    let anchor = section.querySelector(".sb-head");
    for (const workspace of workspaces) {
      const group = this.createWorkspaceGroup(workspace);
      anchor.insertAdjacentElement("afterend", group);
      anchor = group;
    }
    this.sidebarSortableCleanup?.();
    const activateSortableSidebar = () => {
      this.sidebarSortableCleanup?.();
      void this.renderSortableSidebarWorkspaces(section, workspaces);
    };
    section.addEventListener("pointerenter", activateSortableSidebar, { once: true });
    section.addEventListener("focusin", activateSortableSidebar, { once: true });
    this.sidebarSortableCleanup = () => {
      section.removeEventListener("pointerenter", activateSortableSidebar);
      section.removeEventListener("focusin", activateSortableSidebar);
      this.sidebarSortableCleanup = undefined;
    };
  },

  async renderSortableSidebarWorkspaces(section, workspaces) {
    const renderToken = Symbol("sortable-sidebar-render");
    this.sidebarSortableRenderToken = renderToken;
    const [{ default: React }, { createRoot }, { default: SortableWorkspaceSidebar }] = await Promise.all([
      import("react"),
      import("react-dom/client"),
      import("./components/SortableWorkspaceSidebar"),
    ]);
    if (this.sidebarSortableRenderToken !== renderToken || !globalThis.window || !section.isConnected) return;
    let rootHost = section.querySelector("[data-sortable-workspaces]");
    if (!rootHost) {
      rootHost = document.createElement("div");
      rootHost.dataset.sortableWorkspaces = "";
      section.querySelector(".sb-head")?.insertAdjacentElement("afterend", rootHost);
    }
    section.querySelectorAll(":scope > .workspace-group").forEach((group) => group.remove());
    if (!this.sidebarSortableRoot) this.sidebarSortableRoot = createRoot(rootHost);
    this.sidebarSortableRoot.render(React.createElement(SortableWorkspaceSidebar, {
      workspaces,
      activeWorkspaceId: this.dataset.activeWorkspaceId || "",
      activeSessionId: this.dataset.activeSessionId || "",
      openWorkspaceId: this.sidebarOpenWorkspaceId ?? this.dataset.activeWorkspaceId ?? "",
      onWorkspaceOrder: this.reorderWorkspaces.bind(this),
      onSessionOrder: this.reorderWorkspaceSessions.bind(this),
    }));
  },

  reorderWorkspaces(ids) {
    storeWorkspaceOrder(ids);
  },

  reorderWorkspaceSessions(workspaceId, ids) {
    storeSessionOrder(workspaceId, ids);
  },

  createRecentWorkspace(workspace) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "recent-row";
    row.dataset.workspace = workspace.id;
    row.setAttribute("aria-label", `open ${workspace.name}`);
    row.innerHTML = [
      `<span class="glyph">${LUCIDE_CHEVRON_RIGHT_ICON}</span>`,
      "<span class=\"ws-info\"><span class=\"name\"></span><span class=\"path\"></span></span>",
      "<span class=\"ws-stat\"></span>",
      `<span class="open-cta">open ${LUCIDE_CORNER_DOWN_LEFT_ICON}</span>`,
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
    const active = workspace.id === this.dataset.activeWorkspaceId;
    const openWorkspaceId = this.sidebarOpenWorkspaceId ?? this.dataset.activeWorkspaceId ?? "";
    const open = workspace.id === openWorkspaceId;
    group.classList.toggle("active", active);
    group.classList.toggle("has-active-session", this.workspaceHasActiveSession(workspace));
    group.innerHTML = this.workspaceGroupTemplate(workspace, open);
    this.fillWorkspaceGroup(group, workspace);
    return group;
  },

  workspaceHasActiveSession(workspace) {
    return (workspace.sessions || []).some((session) => session.active || session.live);
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
      "<span class=\"ws-stack\"><span class=\"ws-name\"><span class=\"dot\"></span>",
      "<span class=\"label\"></span></span><span class=\"ws-path\"></span></span>",
      `<span class="ws-meta" aria-label="${workspace.sessionCount} sessions"><span class="ws-count">${workspace.sessionCount}</span></span></button>`,
      `<button type="button" class="row-action danger" data-action="delete-workspace"`,
      ` data-workspace="${escapeHtml(workspace.id)}" title="remove workspace" aria-label="remove workspace">${LUCIDE_X_ICON}</button>`,
      `</div><div class="sessions"${open ? "" : " hidden"}></div>`,
    ].join("");
  },

  fillWorkspaceGroup(group, workspace) {
    group.querySelector(".label").textContent = workspace.name;
    group.querySelector(".ws-path").textContent = workspace.path;
    group.querySelector(".ws-name .dot").classList.toggle(
      "live",
      !!workspace.live || this.workspaceHasActiveSession(workspace),
    );
    const sessions = group.querySelector(".sessions");
    appendGroupedSessionRows(sessions, workspace.id, workspace.sessions, this.createSessionRow.bind(this));
    if ((workspace.sessions || []).length === 0) sessions.append(this.createEmptySessionsRow());
    sessions.append(this.createNewSessionRow(workspace.id));
  },

  createEmptySessionsRow() {
    const row = document.createElement("div");
    row.className = "sessions-empty";
    row.textContent = "no sessions yet · press N to start one";
    return row;
  },

  createNewSessionRow(workspaceId) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "session-row new-session-row";
    row.dataset.action = "new-session";
    row.dataset.workspace = workspaceId;
    row.innerHTML = `<span class="title">${LUCIDE_PLUS_ICON} new session</span>`;
    return row;
  },

  toggleWorkspace(id) {
    const targetSessions = this.findWorkspaceGroup?.(id)?.querySelector(".sessions");
    const shouldOpen = !!targetSessions?.hidden;
    this.sidebarOpenWorkspaceId = shouldOpen ? id : "";
    this.querySelectorAll("[data-workspace-group]").forEach((group) => {
      const sessions = group.querySelector(".sessions");
      const row = group.querySelector(".ws-row");
      const open = group.dataset.workspaceGroup === id ? shouldOpen : false;
      if (sessions) sessions.hidden = !open;
      row?.classList.toggle("open", open);
      row?.setAttribute("aria-expanded", String(open));
    });
    window.dispatchEvent(new CustomEvent("pi-sidebar-workspace-state", {
      detail: { activeWorkspaceId: this.dataset.activeWorkspaceId || "", openWorkspaceId: shouldOpen ? id : "" },
    }));
  },

  syncActiveWorkspaceRows() {
    const activeWorkspaceId = this.dataset.activeWorkspaceId;
    this.querySelectorAll("[data-workspace-group]").forEach((group) => {
      const row = group.querySelector(".ws-row");
      const active = group.dataset.workspaceGroup === activeWorkspaceId;
      const hasLiveSession = group.querySelector(".session-row.active");
      const hasActiveSession = !!hasLiveSession;
      group.classList.toggle("active", active);
      group.classList.toggle("has-active-session", hasActiveSession);
      row?.classList.toggle("active", active);
      row?.classList.toggle("has-active-session", hasActiveSession);
      row?.setAttribute("aria-current", active ? "true" : "false");
      row?.querySelector(".ws-name .dot")?.classList.toggle("live", hasActiveSession);
    });
  },
};
