import { getGitCommit, getGitHistory } from "../../lib/api";
import { escapeHtml } from "../../lib/renderers";

const COLORS = ["#8bd5ff", "#c792ea", "#89dd88", "#ffcb6b", "#f78c6c", "#82aaff", "#f07178", "#f6bbe7"];
const GRAPH_ROW_HEIGHT = 64;
const LANE_WIDTH = 16;
const GRAPH_PAD_X = 10;
const ROW_MID_Y = GRAPH_ROW_HEIGHT / 2;
const LINE_OPACITY = 0.78;

export const gitHistoryMethods = {
  async showGitHistory() {
    if (!this.dataset.activeWorkspaceId) return;
    this.ensureGitPanel();
    this.setGitPanelMode("loading");
    try {
      const { commits } = await getGitHistory(this.dataset.activeWorkspaceId, 120);
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
    if (mode === "loading") panel.innerHTML = `<div class="git-empty">loading git graph…</div>`;
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
    const graphRows = layoutGitGraph(commits);
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
    const graph = panel.querySelector("[data-git-graph-library]");
    const list = panel.querySelector("[data-git-commit-list]");
    graph.innerHTML = renderGraphSvg(graphRows);
    for (const commit of commits) list.append(this.createGitCommitRow(commit));
    this.installGitDetailResizer(panel.querySelector("[data-git-history-grid]"));
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
      const startHeight = grid.querySelector("[data-git-commit-scroll]")?.getBoundingClientRect?.().height || 260;
      const onMove = (moveEvent) => {
        const rect = grid.getBoundingClientRect();
        const next = Math.max(128, Math.min(rect.height - 140, startHeight + moveEvent.clientY - startY));
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

function layoutGitGraph(commits) {
  const active = [];
  const rows = [];
  let maxLanes = 1;
  for (const commit of commits) {
    const parents = commit.parents || [];
    let lane = active.indexOf(commit.shortHash);
    if (lane === -1) {
      lane = firstFreeLane(active);
      active[lane] = commit.shortHash;
    }
    const before = [...active];
    const parentLanes = [];
    const next = [...active];
    if (parents[0]) {
      next[lane] = parents[0];
      parentLanes.push(lane);
    } else {
      next[lane] = "";
    }
    let insertAt = lane + 1;
    for (const parent of parents.slice(1)) {
      let parentLane = next.indexOf(parent);
      if (parentLane === -1) {
        while (next[insertAt]) insertAt++;
        next[insertAt] = parent;
        parentLane = insertAt;
      }
      parentLanes.push(parentLane);
      insertAt = parentLane + 1;
    }
    compactTrailingEmpty(next);
    maxLanes = Math.max(maxLanes, before.length, next.length, lane + 1, ...parentLanes.map((item) => item + 1));
    rows.push({ commit, lane, before, after: [...next], parentLanes });
    active.splice(0, active.length, ...next);
  }
  return { rows, maxLanes };
}

function renderGraphSvg(layout) {
  const width = GRAPH_PAD_X * 2 + layout.maxLanes * LANE_WIDTH;
  const height = layout.rows.length * GRAPH_ROW_HEIGHT;
  const paths = [];
  const nodes = [];
  layout.rows.forEach((row, rowIndex) => {
    const yTop = rowIndex * GRAPH_ROW_HEIGHT;
    const yMid = yTop + ROW_MID_Y;
    const yBottom = yTop + GRAPH_ROW_HEIGHT;
    row.before.forEach((hash, lane) => {
      if (!hash) return;
      const x = laneX(lane);
      paths.push(linePath(x, yTop, x, lane === row.lane ? yMid : yBottom, laneColor(lane), LINE_OPACITY));
    });
    row.after.forEach((hash, lane) => {
      if (!hash) return;
      const existedBefore = !!row.before[lane];
      const startsAtCurrentNode = lane === row.lane;
      if (!existedBefore && !startsAtCurrentNode) return;
      const x = laneX(lane);
      paths.push(linePath(x, startsAtCurrentNode ? yMid : yTop, x, yBottom, laneColor(lane), LINE_OPACITY));
    });
    row.parentLanes.forEach((parentLane, index) => {
      if (parentLane === row.lane) return;
      const x1 = laneX(row.lane);
      const x2 = laneX(parentLane);
      const bendY = yMid + 12 + index * 5;
      paths.push(`<path d="M${x1} ${yMid} C${x1} ${bendY} ${x2} ${bendY} ${x2} ${yBottom}" stroke="${laneColor(parentLane)}" stroke-width="2" fill="none" opacity="${LINE_OPACITY}"/>`);
    });
    nodes.push(`<circle cx="${laneX(row.lane)}" cy="${yMid}" r="5" fill="none" stroke="${laneColor(row.lane)}" stroke-width="2" opacity="${LINE_OPACITY}"/>`);
  });
  return `<svg class="git-graph-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${paths.join("")}${nodes.join("")}</svg>`;
}

function linePath(x1, y1, x2, y2, color, opacity) {
  if (y1 === y2) return "";
  return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" stroke-width="2" fill="none" opacity="${opacity}"/>`;
}

function laneX(lane) {
  return GRAPH_PAD_X + lane * LANE_WIDTH + 6;
}

function laneColor(lane) {
  return COLORS[lane % COLORS.length];
}

function firstFreeLane(lanes) {
  const index = lanes.findIndex((item) => !item);
  return index === -1 ? lanes.length : index;
}

function compactTrailingEmpty(lanes) {
  while (lanes.length > 0 && !lanes[lanes.length - 1]) lanes.pop();
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
