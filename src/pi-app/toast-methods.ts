import { sessionEvents } from "../lib/api";
import { parseFallbackChoices } from "./fallback-choices";

const TOAST_MESSAGES = {
  success: {
    title: "응답 완료",
    detail: "세션 응답이 완료되었습니다.",
  },
  choice: {
    title: "선택지 요청",
    detail: "세션에서 선택지 질문을 요청했습니다.",
  },
  error: {
    title: "응답 실패",
    detail: "답변을 받는데 실패했습니다.",
  },
};

function toastText(kind, detail, context) {
  const message = TOAST_MESSAGES[kind] || TOAST_MESSAGES.success;
  return {
    title: message.title,
    detail: [detail || message.detail, context].filter(Boolean).join(" · "),
  };
}

function displayName(name, id) {
  const label = String(name || "").trim();
  const value = String(id || "").trim();
  if (label && value && label !== value) return `${label} (${value})`;
  return label || value || "알 수 없음";
}

export const toastMethods = {
  ensureToastRegion() {
    if (this.toastRegion?.isConnected) return this.toastRegion;
    const region = document.createElement("section");
    region.className = "toast-region";
    region.dataset.toastRegion = "";
    region.setAttribute("aria-label", "session notifications");
    region.setAttribute("aria-live", "polite");
    region.innerHTML = [
      `<button class="toast-dismiss-all" type="button" data-action="dismiss-all-toasts" hidden>전체 닫기</button>`,
      `<div class="toast-list" data-toast-list></div>`,
    ].join("");
    region.addEventListener("click", (event) => this.handleToastClick(event));
    (this.querySelector("[data-main='session']") || this).append(region);
    this.toastRegion = region;
    return region;
  },

  handleToastClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target || !this.toastRegion?.contains(target)) return;
    if (target.dataset.action === "dismiss-all-toasts") this.dismissAllToasts();
    if (target.dataset.action === "dismiss-toast") this.dismissToast(target.closest(".session-toast"));
  },

  showToast(kind, detail, context = this.currentToastContext()) {
    const region = this.ensureToastRegion();
    const list = region.querySelector("[data-toast-list]");
    if (!list) return undefined;
    const toast = document.createElement("button");
    const message = toastText(kind, detail, context);
    toast.type = "button";
    toast.className = `session-toast ${kind}`;
    toast.dataset.action = "dismiss-toast";
    toast.innerHTML = [
      `<span class="toast-dot" aria-hidden="true"></span>`,
      `<span class="toast-copy"><strong></strong><small></small></span>`,
    ].join("");
    toast.querySelector("strong").textContent = message.title;
    toast.querySelector("small").textContent = message.detail;
    list.prepend(toast);
    this.syncToastDismissAll();
    return toast;
  },

  dismissToast(toast) {
    toast?.remove();
    this.syncToastDismissAll();
  },

  dismissAllToasts() {
    this.toastRegion?.querySelectorAll(".session-toast").forEach((toast) => toast.remove());
    this.syncToastDismissAll();
  },

  syncToastDismissAll() {
    const toasts = this.toastRegion?.querySelectorAll(".session-toast") ?? [];
    const dismissAll = this.toastRegion?.querySelector(".toast-dismiss-all");
    dismissAll?.toggleAttribute("hidden", toasts.length < 2);
  },

  currentToastContext() {
    const workspace = displayName(
      this.querySelector("[data-active-workspace]")?.textContent,
      this.dataset.activeWorkspaceId,
    );
    const session = displayName(
      this.querySelector("[data-active-session-title]")?.textContent,
      this.dataset.activeSessionId,
    );
    return `workspace: ${workspace} / session: ${session}`;
  },

  notifySessionCompleted(context) {
    this.showToast("success", undefined, context);
  },

  notifyChoiceRequested(context) {
    this.showToast("choice", undefined, context);
  },

  notifyResponseFailure(detail, context) {
    if (this.responseFailureToastShown && !context) return;
    if (!context) this.responseFailureToastShown = true;
    this.showToast("error", detail, context);
  },

  syncBackgroundSessionWatches() {
    const watched = this.backgroundSessionWatches || new Map();
    if (!this.apiConnected || typeof EventSource === "undefined") {
      watched.forEach((watch) => watch.source?.close?.());
      watched.clear();
      this.backgroundSessionWatches = watched;
      return;
    }
    const rows = this.backgroundWatchRows();
    for (const [sessionId, watch] of watched) {
      if (rows.has(sessionId)) continue;
      watch.source?.close?.();
      watched.delete(sessionId);
    }
    for (const [sessionId, row] of rows) {
      if (!watched.has(sessionId)) watched.set(sessionId, this.watchBackgroundSession(row));
    }
    this.backgroundSessionWatches = watched;
  },

  backgroundWatchRows() {
    const rows = new Map();
    this.querySelectorAll(".session-row.active[data-session]").forEach((row) => {
      if (row.dataset.session && row.dataset.session !== this.dataset.activeSessionId) rows.set(row.dataset.session, row);
    });
    return rows;
  },

  watchBackgroundSession(row) {
    const sessionId = row.dataset.session;
    const watch: any = { failed: false, row, wasRunning: true };
    watch.source = sessionEvents(sessionId, {
      replay: false,
      onError: () => undefined,
      onEvent: (event) => this.handleBackgroundSessionEvent(event, watch),
    });
    return watch;
  },

  handleBackgroundSessionEvent(event, watch) {
    if (!event || event.type === "heartbeat") return;
    const context = this.toastContextForSessionRow(watch.row);
    if (event.type === "error") {
      watch.failed = true;
      this.notifyResponseFailure(event.payload?.error, context);
      return;
    }
    if (event.type === "session.message" && parseFallbackChoices(event.payload?.text).length) {
      this.notifyChoiceRequested(context);
      return;
    }
    if (event.type !== "session.status") return;
    const status = event.payload?.status;
    if (status === "running" || status === "thinking") watch.wasRunning = true;
    if (status !== "idle" && status !== "cancelled") return;
    this.dismissBackgroundSessionWatch(event.sessionId, watch);
    if (watch.wasRunning && status === "idle" && !watch.failed) this.notifySessionCompleted(context);
  },

  dismissBackgroundSessionWatch(sessionId, watch) {
    watch.source?.close?.();
    this.backgroundSessionWatches?.delete(sessionId);
    this.markSessionRunning?.(watch.row, false);
    this.updateSessionMeta?.(watch.row, false);
    this.syncActiveWorkspaceRows?.();
  },

  toastContextForSessionRow(row) {
    const workspaceId = row?.dataset.workspace;
    const workspaceName = this.querySelector(`[data-workspace-group='${workspaceId}'] .label`)?.textContent;
    return `workspace: ${displayName(workspaceName, workspaceId)} / session: ${displayName(row?.dataset.title, row?.dataset.session)}`;
  },
};
