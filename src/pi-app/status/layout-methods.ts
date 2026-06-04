import { fullToolBody } from "../messages/tool-output-rendering";

const SIDEBAR_WIDTH_KEY = "pi.sb.width";

function readStoredSidebarWidth() {
  try {
    const storedWidthValue = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!storedWidthValue) return undefined;
    const width = Number(storedWidthValue);
    return Number.isFinite(width) ? Math.min(480, Math.max(200, width)) : undefined;
  } catch {
    return undefined;
  }
}

function storeSidebarWidth(width) {
  try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width)); } catch {}
}

export const layoutMethods = {
  shortcut(event) {
    if (event.key === "Tab") this.trapSettingsFocus?.(event);
    if (event.key === "Escape") this.closeModals();
  },

  route(route) {
    this.dataset.route = route;
    this.querySelector('[data-view="picker"]')?.toggleAttribute("hidden", route !== "picker");
    this.querySelector('[data-view="workspace"]')?.toggleAttribute("hidden", route !== "workspace");
    this.querySelectorAll('[data-action="toggle-plugin-sidebar"]').forEach((button) => {
      button.toggleAttribute("hidden", route !== "workspace");
    });
    if (route === "picker") {
      this.querySelector('.picker-shell input[name="path"]')?.focus();
      if (this.apiConnected) void this.browseFolder();
    }
    if (route === "workspace") this.scrollTerm();
  },

  togglePluginSidebar(panelId, forceOpen) {
    const body = this.querySelector(".app-body");
    const tree = this.querySelector("[data-plugin-sidebar]") || this.querySelector(".tree");
    const currentPanel = tree?.dataset.activePluginPanel || "file-browser";
    const nextPanel = panelId || currentPanel;
    const treeEnabled = forceOpen ?? (this.dataset.tree !== "on" || currentPanel !== nextPanel);
    this.dataset.tree = treeEnabled ? "on" : "off";
    tree?.setAttribute("data-active-plugin-panel", nextPanel);
    body?.classList.toggle("with-tree", treeEnabled);
    body?.classList.toggle("tree-open", treeEnabled);
    this.querySelectorAll('[data-action="toggle-plugin-sidebar"]').forEach((button) => {
      button.classList.toggle("on", treeEnabled && button.dataset.pluginPanel === nextPanel);
    });
    tree?.toggleAttribute("hidden", !treeEnabled);
    this.syncPluginSidebarPanels?.();
    if (treeEnabled) {
      window.dispatchEvent(new CustomEvent("pi-plugin-sidebar:open", {
        detail: { panel: nextPanel, workspaceId: this.dataset.activeWorkspaceId || "" },
      }));
    }
    this.applyGrid();
  },

  toggleTree(forceOpen) {
    this.togglePluginSidebar?.("file-browser", forceOpen);
  },

  syncPluginSidebarPanels() {
    const tree = this.querySelector("[data-plugin-sidebar]") || this.querySelector(".tree");
    if (!tree) return;
    const activePanel = tree.dataset.activePluginPanel || "file-browser";
    let visiblePanel = false;
    tree.querySelectorAll("[data-plugin-panel]").forEach((panel) => {
      const visible = panel.dataset.pluginPanel === activePanel;
      panel.toggleAttribute("hidden", !visible);
      visiblePanel = visiblePanel || visible;
    });
    tree.querySelector("[data-plugin-sidebar-empty]")?.toggleAttribute("hidden", visiblePanel);
  },

  closeTreeFromOutside(event) {
    if (this.dataset.tree !== "on") return;
    const selector = ".tree, [data-action='toggle-plugin-sidebar'], [data-file-editor-modal]";
    const path = event.composedPath?.() || [];
    if (path.some((node) => node?.matches?.(selector))) return;
    const target = event.target;
    if (target?.closest?.(selector)) return;
    this.toggleTree(false);
  },

  toggleDrawer(forceOpen) {
    const body = this.querySelector(".app-body");
    if (!body) return;
    const open = forceOpen ?? !body.classList.contains("drawer-open");
    body.classList.toggle("drawer-open", open);
    const button = this.querySelector('[data-action="open-drawer"]');
    button?.setAttribute("aria-expanded", String(open));
    button?.setAttribute("aria-label", open ? "close sidebar" : "open sidebar");
  },

  collapseSidebar(collapsed) {
    this.dataset.sidebar = collapsed ? "collapsed" : "open";
    this.querySelector(".sidebar-wrap")?.toggleAttribute("hidden", collapsed);
    const expand = this.querySelector(".sb-expand-btn");
    if (expand) expand.style.display = collapsed ? "inline-flex" : "none";
    try { localStorage.setItem("pi.sb.collapsed", collapsed ? "1" : "0"); } catch {}
    this.applyGrid();
  },

  restoreSidebar() {
    const width = readStoredSidebarWidth();
    if (width) this.dataset.sidebarWidth = String(width);
    if (this.dataset.sidebar === "collapsed") {
      this.collapseSidebar(true);
      return;
    }
    try { this.collapseSidebar(localStorage.getItem("pi.sb.collapsed") === "1"); } catch { this.applyGrid(width); }
  },

  applyGrid(width = Number(this.dataset.sidebarWidth || 280)) {
    const body = this.querySelector(".app-body");
    if (!body) return;
    const tree = this.dataset.tree === "on";
    const hasSidebar = !!this.querySelector(".sidebar-wrap");
    const collapsed = !hasSidebar || this.dataset.sidebar === "collapsed";
    const treeWidth = 320;
    const expandedColumns = tree ? `${width}px 1fr ${treeWidth}px` : `${width}px 1fr`;
    const collapsedColumns = tree ? `1fr ${treeWidth}px` : "1fr";
    body.style.gridTemplateColumns = collapsed ? collapsedColumns : expandedColumns;
  },

  startResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = Number(this.dataset.sidebarWidth || 280);
    const saveWidth = (width) => storeSidebarWidth(width);
    const move = (moveEvent) => {
      const width = Math.min(480, Math.max(200, startWidth + moveEvent.clientX - startX));
      this.dataset.sidebarWidth = String(width);
      this.applyGrid(width);
      saveWidth(width);
    };
    const stopResize = () => {
      storeSidebarWidth(Number(this.dataset.sidebarWidth || startWidth));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stopResize);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stopResize);
  },

  toggleTool(button) {
    const card = button.closest(".tool-card");
    const body = card?.querySelector(".tc-body");
    if (!card || !body) return;
    card.classList.toggle("collapsed", !body.hidden);
    body.hidden = !body.hidden;
    button.setAttribute("aria-expanded", String(!body.hidden));
    button.querySelector(".tc-caret").textContent = body.hidden ? "▸" : "▾";
    this.notifyTranscriptNodeHeightDidChange(card);
  },

  showFullToolOutput(button) {
    const body = button?.closest(".tc-body");
    const fullBody = fullToolBody(body);
    if (!body || !fullBody) return;
    body.textContent = fullBody;
    body.dataset.largeToolBody = "rendered";
    this.notifyTranscriptNodeHeightDidChange(body);
  },

  scrollTerm() {
    if (this.scrollFrame) return;
    const scroll = () => {
      const term = this.querySelector(".term");
      if (term) term.scrollTop = term.scrollHeight;
    };
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = undefined;
      scroll();
      window.requestAnimationFrame(scroll);
    });
  },
};
