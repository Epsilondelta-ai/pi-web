const SIDEBAR_WIDTH_KEY = "pi.sb.width";

function readStoredSidebarWidth() {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!raw) return undefined;
    const width = Number(raw);
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

  toggleTree() {
    const body = this.querySelector(".app-body");
    const tree = this.querySelector(".tree");
    const on = this.dataset.tree !== "on";
    this.dataset.tree = on ? "on" : "off";
    body?.classList.toggle("with-tree", on);
    body?.classList.toggle("tree-open", on);
    this.querySelector('[data-action="toggle-tree"]')?.classList.toggle("on", on);
    tree?.toggleAttribute("hidden", !on);
    this.applyGrid();
  },

  toggleTreeNode(button) {
    const branch = button.closest(".tree-branch");
    const children = branch?.querySelector(":scope > [data-tree-children]");
    if (!children) return;
    const open = children.hidden;
    children.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.querySelector(".glyph").textContent = open ? "▾" : "▸";
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
    body.style.gridTemplateColumns = collapsed ? (tree ? "1fr 260px" : "1fr") : (tree ? `${width}px 1fr 260px` : `${width}px 1fr`);
  },

  startResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const start = Number(this.dataset.sidebarWidth || 280);
    const saveWidth = (width) => storeSidebarWidth(width);
    const move = (moveEvent) => {
      const width = Math.min(480, Math.max(200, start + moveEvent.clientX - startX));
      this.dataset.sidebarWidth = String(width);
      this.applyGrid(width);
      saveWidth(width);
    };
    const up = () => {
      storeSidebarWidth(Number(this.dataset.sidebarWidth || start));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  },

  toggleTool(button) {
    const card = button.closest(".tool-card");
    const body = card?.querySelector(".tc-body");
    if (!card || !body) return;
    card.classList.toggle("collapsed", !body.hidden);
    body.hidden = !body.hidden;
    button.setAttribute("aria-expanded", String(!body.hidden));
    button.querySelector(".tc-caret").textContent = body.hidden ? "▸" : "▾";
  },

  scrollTerm() {
    const scroll = () => {
      const term = this.querySelector(".term");
      if (term) term.scrollTop = term.scrollHeight;
    };
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  },
};
