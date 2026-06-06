import { getGitCommit, getGitHistory } from "../../shared/api/api";
import { fallbackValue } from "../../shared/fallbacks/fallbacks";
import { escapeHtml } from "../../shared/renderers/renderers";

const LUCIDE_LIST_PLUS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 12H3"></path><path d="M16 6H3"></path><path d="M16 18H3"></path><path d="M18 9v6"></path><path d="M21 12h-6"></path></svg>`;
const LUCIDE_X_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
const GIT_HISTORY_PAGE_SIZE = 30;
const MAX_GIT_HISTORY_COMMITS = 200;

export const gitHistoryMethods = {
  async showGitHistory() {
    if (!this.dataset.activeWorkspaceId) return;
    this.ensureGitPanel();
    this.setGitPanelMode("loading");
    try {
      this.gitHistoryLimit = GIT_HISTORY_PAGE_SIZE;
      const { commits } = await getGitHistory(this.dataset.activeWorkspaceId, this.gitHistoryLimit);
      this.gitHistoryCommits = commits || [];
      this.gitHistoryHasMore = this.gitHistoryCommits.length >= this.gitHistoryLimit
        && this.gitHistoryLimit < MAX_GIT_HISTORY_COMMITS;
      this.renderGitHistory(this.gitHistoryCommits);
    } catch (error) {
      this.renderGitHistoryError(fallbackValue(error?.message, "git history unavailable"));
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
  },

  setGitPanelMode(mode) {
    const panel = this.querySelector("[data-git-panel]");
    if (!panel) return;
    panel.dataset.mode = mode;
    if (mode === "loading") panel.innerHTML = `<div class="git-empty">loading git history…</div>`;
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
      `<div class="git-history-toolbar">`,
      `<button type="button" data-action="load-more-git-history"`,
      ` ${this.gitHistoryHasMore ? "" : "disabled"}>${LUCIDE_LIST_PLUS_ICON}<span>load 30 more</span></button>`,
      `</div>`,
      `<div class="git-commit-scroll" data-git-commit-scroll>`,
      `<div class="git-commit-list" data-git-commit-list></div>`,
      `</div>`,
      `</div>`,
    ].join("");
    const list = panel.querySelector("[data-git-commit-list]");
    for (const commit of commits) list.append(this.createGitCommitRow(commit));
  },

  async loadMoreGitHistory() {
    if (!this.dataset.activeWorkspaceId || !this.gitHistoryHasMore) return;
    const nextLimit = Math.min((this.gitHistoryLimit || GIT_HISTORY_PAGE_SIZE) + GIT_HISTORY_PAGE_SIZE, MAX_GIT_HISTORY_COMMITS);
    const button = this.querySelector("[data-action='load-more-git-history']");
    if (button) button.disabled = true;
    try {
      const scroll = this.querySelector("[data-git-commit-scroll]");
      const scrollTop = fallbackValue(scroll?.scrollTop, 0);
      const { commits } = await getGitHistory(this.dataset.activeWorkspaceId, nextLimit);
      this.gitHistoryLimit = nextLimit;
      this.gitHistoryCommits = fallbackValue(commits, []);
      this.gitHistoryHasMore = this.gitHistoryCommits.length >= nextLimit && nextLimit < MAX_GIT_HISTORY_COMMITS;
      this.renderGitHistory(this.gitHistoryCommits);
      const nextScroll = this.querySelector("[data-git-commit-scroll]");
      if (nextScroll) nextScroll.scrollTop = scrollTop;
    } catch (error) {
      this.renderGitHistoryError(fallbackValue(error?.message, "git history unavailable"));
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
    const detail = this.ensureGitDetail();
    detail.innerHTML = `<div class="git-empty">loading commit…</div>`;
    try {
      const response = await getGitCommit(this.dataset.activeWorkspaceId, hash);
      this.renderGitCommitDetail(response);
    } catch (error) {
      detail.innerHTML = `<div class="git-empty err">${escapeHtml(fallbackValue(error?.message, "commit unavailable"))}</div>`;
    }
  },

  ensureGitDetail() {
    let detail = this.querySelector("[data-git-detail]");
    if (detail) {
      this.querySelector("[data-git-history-grid]")?.classList.add("detail-open");
      return detail;
    }
    detail = document.createElement("div");
    detail.className = "git-detail";
    detail.dataset.gitDetail = "";
    const grid = this.querySelector("[data-git-history-grid]");
    grid?.append(detail);
    grid?.classList.add("detail-open");
    return detail;
  },

  closeGitDetail() {
    this.querySelector("[data-git-detail]")?.remove();
    this.querySelector("[data-git-history-grid]")?.classList.remove("detail-open");
    this.querySelectorAll(".git-commit-row").forEach((row) => row.classList.remove("selected"));
  },

  renderGitCommitDetail(detail) {
    const target = this.ensureGitDetail();
    const commit = detail.commit || {};
    const files = commit.files || [];
    target.innerHTML = [
      `<div class="git-detail-head">`,
      `<button type="button" class="git-detail-close" data-action="close-git-detail" aria-label="close commit details" title="close commit details">${LUCIDE_X_ICON}</button>`,
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

export function fileTemplate(file) {
  const oldPath = file.oldPath ? `<small>${escapeHtml(file.oldPath)} →</small>` : "";
  return `<div class="git-file"><span class="status ${escapeHtml(file.status || "modified")}">${escapeHtml(file.status || "modified")}</span><span class="path">${oldPath}${escapeHtml(file.path || "")}</span><span class="nums"><span class="add">+${file.additions || 0}</span><span class="del">-${file.deletions || 0}</span></span></div>`;
}

export function refsTemplate(refs = []) {
  if (!refs.length) return "";
  return `<span class="git-refs">${refs.map((ref) => `<em>${escapeHtml(ref)}</em>`).join("")}</span>`;
}

export function formatGitDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
