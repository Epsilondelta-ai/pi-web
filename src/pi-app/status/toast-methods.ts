import { Notyf, NotyfEvent } from "notyf";
import { sessionEvents } from "../../lib/api";
import { escapeHtml } from "../../lib/renderers";
import { parseFallbackChoices } from "../input/fallback-choices";

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
  connection: {
    title: "백엔드 연결 끊김",
    detail: "프론트엔드와 백엔드 연결이 끊겼습니다. 재연결 중입니다.",
  },
};

const BACKEND_CONNECTION_ERROR_PATTERNS = [
  /failed to fetch/i,
  /fetch failed/i,
  /load failed/i,
  /network\s*error/i,
  /err_connection/i,
  /connection\s*(refused|reset|closed|aborted)/i,
  /backend\s*disconnected/i,
  /event\s*stream/i,
  /body\s*stream/i,
  /terminated/i,
];

function isBackendConnectionError(detail) {
  const message = typeof detail === "string" ? detail : detail?.message || String(detail || "");
  return BACKEND_CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function toastText(kind, detail, context) {
  const message = TOAST_MESSAGES[kind] || TOAST_MESSAGES.success;
  const label = toastContextLabel(context);
  return {
    title: message.title,
    detail: [detail || message.detail, label].filter(Boolean).join(" · "),
  };
}

function toastHtml(message) {
  return [
    `<span class="toast-dot" aria-hidden="true"></span>`,
    `<span class="toast-copy"><strong>${escapeHtml(message.title)}</strong>`
      + `<small>${escapeHtml(message.detail)}</small></span>`,
  ].join("");
}

function toastContextLabel(context) {
  if (!context || typeof context === "string") return context;
  return context.label;
}

function toastContextSessionId(context) {
  if (!context || typeof context === "string") return undefined;
  return context.sessionId;
}

function displayName(name, id) {
  const label = String(name || "").trim();
  const value = String(id || "").trim();
  if (label && value && label !== value) return `${label} (${value})`;
  return label || value || "알 수 없음";
}

export const toastMethods = {
  ensureToastRegion() {
    if (!this.notyf) {
      this.notyf = new Notyf({
        duration: 0,
        dismissible: true,
        position: { x: "right", y: "top" },
        ripple: false,
        types: [
          { type: "success", icon: false, className: "session-toast success" },
          { type: "choice", icon: false, className: "session-toast choice" },
          { type: "error", icon: false, className: "session-toast error" },
          { type: "connection", icon: false, className: "session-toast connection" },
        ],
      });
    }
    return this.notyf;
  },

  handleToastClick() {},

  showToast(kind, detail, context = this.currentToastContext()) {
    const notyf = this.ensureToastRegion();
    const message = toastText(kind, detail, context);
    const sessionId = toastContextSessionId(context);
    const notification = notyf.open({
      type: TOAST_MESSAGES[kind] ? kind : "success",
      message: toastHtml(message),
    });
    notification.on(NotyfEvent.Click, () => {
      this.activateToastSession(sessionId);
      this.dismissToast(notification);
    });
    return notification;
  },

  dismissToast(toast) {
    if (toast) this.notyf?.dismiss(toast);
  },

  dismissAllToasts() {
    this.notyf?.dismissAll();
  },

  syncToastDismissAll() {},

  activateToastSession(sessionId) {
    if (!sessionId || sessionId === this.dataset.activeSessionId) return;
    const row = [...this.querySelectorAll(".session-row[data-session]")]
      .find((item) => item.dataset.session === sessionId);
    if (row) this.pickSession(row);
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
    return {
      label: `workspace: ${workspace} / session: ${session}`,
      sessionId: this.dataset.activeSessionId,
    };
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
    if (isBackendConnectionError(detail)) {
      this.setConnection?.("err");
      this.showToast("connection", undefined, context);
      return;
    }
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
    return {
      label: [
        `workspace: ${displayName(workspaceName, workspaceId)}`,
        `session: ${displayName(row?.dataset.title, row?.dataset.session)}`,
      ].join(" / "),
      sessionId: row?.dataset.session,
    };
  },
};
