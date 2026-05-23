import { createGitgraph, Mode, Orientation, templateExtend, TemplateName } from "@gitgraph/js";
import { getGitCommit, getGitHistory } from "../../lib/api";
import { escapeHtml } from "../../lib/renderers";

const COLORS = ["#8bd5ff", "#c792ea", "#89dd88", "#ffcb6b", "#f78c6c", "#82aaff", "#f07178"];
const GRAPH_ROW_HEIGHT = 44;

export const gitHistoryMethods = {
  async showGitHistory() {
    if (!this.dataset.activeWorkspaceId) return;
    this.ensureGitPanel();
    this.setGitPanelMode("loading");
    try {
      const { commits } = await getGitHistory(this.dataset.activeWorkspaceId, 80);
      this.gitHistoryCommits = commits || [];
      this.renderGitHistory(this.gitHistoryCommits);
      if (this.gitHistoryCommits[0]) await this.selectGitCommit(this.gitHistoryCommits[0].hash);
    } catch (error) {
      this.renderGitHistoryError(error?.message || "git history unavailable");
    }
  },

  async refreshGitHistory() {
    if (!this.gitPanelOpen()) return;
    await this.showGitHistory();
  },

  gitPanelOpen() {
    return !this.querySelector("[data-git-panel]")?.hidden;
  },

  ensureGitPanel() {
    const panel = this.querySelector("[data-git-panel]");
    const fileTree = this.querySelector(".tree-list");
    if (!panel || !fileTree) return;
    panel.hidden = false;
    fileTree.hidden = true;
    this.querySelector("[data-action='show-git-history']")?.classList.add("on");
    this.querySelector("[data-action='show-file-tree']")?.classList.remove("on");
  },

  showFileTreePanel() {
    this.querySelector("[data-git-panel]")?.setAttribute("hidden", "");
    this.querySelector(".tree-list")?.removeAttribute("hidden");
    this.querySelector("[data-action='show-git-history']")?.classList.remove("on");
    this.querySelector("[data-action='show-file-tree']")?.classList.add("on");
  },

  setGitPanelMode(mode) {
    const panel = this.querySelector("[data-git-panel]");
    if (!panel) return;
    panel.dataset.mode = mode;
    if (mode === "loading") {
      panel.innerHTML = `<div class="git-empty">loading git graph…</div>`;
    }
  },

  renderGitHistoryError(message) {
    const panel = this.querySelector("[data-git-panel]");
    if (!panel) return;
    panel.innerHTML = `<div class="git-empty err">${escapeHtml(message)}</div>`;
  },

  renderGitHistory(commits) {
    const panel = this.querySelector("[data-git-panel]");
    if (!panel) return;
    if (!commits.length) {
      panel.innerHTML = `<div class="git-empty">no commits found</div>`;
      return;
    }
    panel.innerHTML = [
      `<div class="git-history-grid" data-git-history-grid>`,
      `<div class="git-commit-scroll" data-git-commit-scroll>`,
      `<div class="git-graph-library" data-git-graph-library></div>`,
      `<div class="git-commit-list" data-git-commit-list></div>`,
      `</div>`,
      `<div class="git-detail-resizer" data-git-detail-resizer role="separator" aria-orientation="horizontal" aria-label="resize git commit details" title="drag to resize details"></div>`,
      `<div class="git-detail" data-git-detail><div class="git-empty">select a commit</div></div>`,
      `</div>`,
    ].join("");
    const list = panel.querySelector("[data-git-commit-list]");
    for (const commit of commits) list.append(this.createGitCommitRow(commit));
    this.renderGitGraphLibrary(panel.querySelector("[data-git-graph-library]"), commits);
    this.installGitDetailResizer(panel.querySelector("[data-git-history-grid]"));
  },

  renderGitGraphLibrary(container, commits) {
    if (!container) return;
    container.replaceChildren();
    try {
      const gitgraph = createGitgraph(container, {
        mode: Mode.Compact,
        orientation: Orientation.VerticalReverse,
        responsive: false,
        template: templateExtend(TemplateName.Metro, {
          colors: COLORS,
          commit: {
            spacing: GRAPH_ROW_HEIGHT,
            dot: { size: 9 },
            message: { display: false },
          },
          branch: {
            lineWidth: 2,
            spacing: 14,
            label: { display: false },
          },
        }),
      });
      gitgraph.import(commits.map(gitgraphImportCommit));
      container.querySelector("svg")?.setAttribute("aria-hidden", "true");
    } catch (error) {
      container.innerHTML = `<div class="git-empty err">git graph render failed: ${escapeHtml(error?.message || String(error))}</div>`;
    }
  },

  createGitCommitRow(commit) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "git-commit-row";
    row.dataset.action = "select-git-commit";
    row.dataset.hash = commit.hash;
    row.innerHTML = [
      `<span class="git-commit-main">`,
      `<span class="git-subject"></span>`,
      `<span class="git-meta"><code>${escapeHtml(commit.shortHash)}</code> · ${escapeHtml(commit.authorName || "unknown")} · ${formatGitDate(commit.date)}</span>`,
      `<span class="git-stats"><span class="add">+${commit.additions || 0}</span><span class="del">-${commit.deletions || 0}</span><span>${(commit.files || []).length} files</span></span>`,
      `</span>`,
    ].join("");
    row.querySelector(".git-subject").textContent = commit.subject || commit.shortHash;
    return row;
  },

  async selectGitCommit(hash) {
    if (!hash || !this.dataset.activeWorkspaceId) return;
    this.querySelectorAll(".git-commit-row").forEach((row) => row.classList.toggle("selected", row.dataset.hash === hash));
    const detail = this.querySelector("[data-git-detail]");
    if (detail) detail.innerHTML = `<div class="git-empty">loading commit…</div>`;
    try {
      const response = await getGitCommit(this.dataset.activeWorkspaceId, hash);
      this.renderGitCommitDetail(response);
    } catch (error) {
      if (detail) detail.innerHTML = `<div class="git-empty err">${escapeHtml(error?.message || "commit unavailable")}</div>`;
    }
  },

  installGitDetailResizer(grid) {
    const resizer = grid?.querySelector("[data-git-detail-resizer]");
    if (!grid || !resizer || resizer.dataset.bound) return;
    resizer.dataset.bound = "true";
    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      resizer.setPointerCapture?.(event.pointerId);
      const startY = event.clientY;
      const startHeight = grid.querySelector("[data-git-commit-scroll]")?.getBoundingClientRect?.().height || 220;
      const onMove = (moveEvent) => {
        const rect = grid.getBoundingClientRect();
        const next = Math.max(96, Math.min(rect.height - 140, startHeight + moveEvent.clientY - startY));
        grid.style.setProperty("--git-list-height", `${next}px`);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    });
  },

  renderGitCommitDetail(detail) {
    const target = this.querySelector("[data-git-detail]");
    if (!target) return;
    const commit = detail.commit || {};
    const files = commit.files || [];
    target.innerHTML = [
      `<div class="git-detail-head">`,
      `<strong>${escapeHtml(commit.subject || commit.shortHash || "commit")}</strong>`,
      `<span><code>${escapeHtml(commit.shortHash || "")}</code> · ${escapeHtml(commit.authorName || "unknown")} · ${formatGitDate(commit.date)}</span>`,
      refsTemplate(commit.refs),
      `</div>`,
      `<div class="git-file-list">${files.map(fileTemplate).join("") || `<span class="git-empty-inline">no file stats</span>`}</div>`,
      `<pre class="git-message">${escapeHtml(detail.body || commit.subject || "")}</pre>`,
      detail.truncated ? `<div class="git-truncated">diff truncated for performance</div>` : "",
      `<pre class="git-diff">${escapeHtml(detail.diff || "no diff")}</pre>`,
    ].join("");
  },
};

function gitgraphImportCommit(commit) {
  const timestamp = Date.parse(commit.date || "") || Date.now();
  return {
    hash: commit.shortHash,
    subject: commit.subject || commit.shortHash,
    body: "",
    author: { name: commit.authorName || "unknown", email: commit.authorEmail || "", timestamp },
    committer: { name: commit.authorName || "unknown", email: commit.authorEmail || "", timestamp },
    parents: commit.parents || [],
    refs: commit.refs || [],
  };
}

function fileTemplate(file) {
  const oldPath = file.oldPath ? `<small>${escapeHtml(file.oldPath)} →</small>` : "";
  return `<div class="git-file"><span class="status ${escapeHtml(file.status || "modified")}">${escapeHtml(file.status || "modified")}</span><span class="path">${oldPath}${escapeHtml(file.path || "")}</span><span class="nums"><span class="add">+${file.additions || 0}</span><span class="del">-${file.deletions || 0}</span></span></div>`;
}

function refsTemplate(refs = []) {
  if (!refs.length) return "";
  return `<span class="git-refs">${refs.map((ref) => `<em>${escapeHtml(ref)}</em>`).join("")}</span>`;
}

function formatGitDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
