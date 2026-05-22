import { getGitCommit, getGitHistory } from "../../lib/api";
import { escapeHtml } from "../../lib/renderers";

const COLORS = ["#8bd5ff", "#c792ea", "#89dd88", "#ffcb6b", "#f78c6c", "#82aaff", "#f07178"];

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
      `<div class="git-history-grid">`,
      `<div class="git-commit-list" data-git-commit-list></div>`,
      `<div class="git-detail" data-git-detail><div class="git-empty">select a commit</div></div>`,
      `</div>`,
    ].join("");
    const list = panel.querySelector("[data-git-commit-list]");
    const lanes = layoutGitLanes(commits);
    for (let index = 0; index < commits.length; index++) {
      list.append(this.createGitCommitRow(commits[index], lanes[index]));
    }
  },

  createGitCommitRow(commit, lane) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "git-commit-row";
    row.dataset.action = "select-git-commit";
    row.dataset.hash = commit.hash;
    row.innerHTML = [
      `<span class="git-graph-cell">${gitLaneSvg(lane)}</span>`,
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

function layoutGitLanes(commits) {
  const active = [];
  const lanes = [];
  for (const commit of commits) {
    let lane = active.indexOf(commit.shortHash);
    if (lane === -1) {
      lane = firstOpenLane(active);
      active[lane] = commit.shortHash;
    }
    const parents = commit.parents || [];
    const before = [...active];
    const parentLanes = [];
    if (parents.length > 0) {
      active[lane] = parents[0];
      parentLanes.push(lane);
    } else {
      active[lane] = "";
    }
    for (const parent of parents.slice(1)) {
      let parentLane = active.indexOf(parent);
      if (parentLane === -1) {
        parentLane = firstOpenLane(active);
        active[parentLane] = parent;
      }
      parentLanes.push(parentLane);
    }
    const after = [...active];
    lanes.push({ lane, before, after, parentLanes, color: COLORS[lane % COLORS.length] });
  }
  return lanes;
}

function firstOpenLane(lanes) {
  const index = lanes.findIndex((item) => !item);
  return index === -1 ? lanes.length : index;
}

function gitLaneSvg(lane) {
  const laneCount = Math.max(lane.before.length, lane.after.length, lane.lane + 1, ...lane.parentLanes.map((item) => item + 1));
  const width = Math.max(42, laneCount * 14 + 18);
  const nodeX = laneX(lane.lane);
  const topLines = lane.before.map((hash, index) => laneLine(hash, index, 0, index === lane.lane ? 19 : 38)).join("");
  const bottomLines = lane.after.map((hash, index) => laneLine(hash, index, index === lane.lane ? 19 : 0, 38)).join("");
  const parentEdges = lane.parentLanes.map((parentLane, index) => {
    const parentX = laneX(parentLane);
    const color = COLORS[parentLane % COLORS.length];
    if (parentLane === lane.lane) return "";
    const midY = 24 + index * 3;
    return `<path d="M${nodeX} 19 C${nodeX} ${midY} ${parentX} ${midY} ${parentX} 38" stroke="${color}" stroke-width="2" fill="none" opacity=".82"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} 38" width="${width}" height="38" aria-hidden="true">${topLines}${bottomLines}${parentEdges}<circle cx="${nodeX}" cy="19" r="4.5" fill="var(--bg)" stroke="${lane.color}" stroke-width="2.5"/></svg>`;
}

function laneX(index) {
  return index * 14 + 8;
}

function laneLine(hash, index, y1, y2) {
  if (!hash || y1 === y2) return "";
  const x = laneX(index);
  const stroke = COLORS[index % COLORS.length];
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="2" opacity=".62"/>`;
}
