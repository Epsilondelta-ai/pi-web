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
    if (event.key === "Escape") this.closeModals();
  },

  route(route) {
    this.dataset.route = route;
    this.querySelector('[data-view="picker"]')?.toggleAttribute("hidden", route !== "picker");
    this.querySelector('[data-view="workspace"]')?.toggleAttribute("hidden", route !== "workspace");
    this.querySelector('[data-action="toggle-tree"]')?.toggleAttribute("hidden", route !== "workspace");
    if (route === "picker") {
      this.querySelector('.picker-shell input[name="path"]')?.focus();
      if (this.apiConnected) void this.browseFolder();
    }
    if (route === "workspace") this.scrollTerm();
  },

  toggleTree(forceOpen) {
    const body = this.querySelector(".app-body");
    const tree = this.querySelector(".tree");
    const treeEnabled = forceOpen ?? this.dataset.tree !== "on";
    this.dataset.tree = treeEnabled ? "on" : "off";
    body?.classList.toggle("with-tree", treeEnabled);
    body?.classList.toggle("tree-open", treeEnabled);
    this.querySelector('[data-action="toggle-tree"]')?.classList.toggle("on", treeEnabled);
    tree?.toggleAttribute("hidden", !treeEnabled);
    this.applyGrid();
  },

  closeTreeFromOutside(event) {
    if (this.dataset.tree !== "on") return;
    const target = event.target;
    if (target?.closest?.(".tree, [data-action='toggle-tree']")) return;
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
    const collapsed = this.dataset.sidebar === "collapsed";
    const expandedColumns = tree ? `${width}px 1fr 260px` : `${width}px 1fr`;
    const collapsedColumns = tree ? "1fr 260px" : "1fr";
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
