import { fullToolBody } from "../messages/tool-output-rendering";

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

  restoreSidebar() {
    this.applyGrid();
  },

  applyGrid() {
    const body = this.querySelector(".app-body");
    if (!body) return;
    const tree = this.dataset.tree === "on";
    const treeWidth = 320;
    body.style.gridTemplateColumns = tree ? `1fr ${treeWidth}px` : "1fr";
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
