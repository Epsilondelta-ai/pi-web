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
  warning: {
    title: "경고",
    detail: "확인이 필요합니다.",
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

const UNREAD_COMPLETED_SESSIONS_KEY = "piweb:unread-completed-sessions";
const LAST_SESSION_PROMPTS_KEY = "piweb:last-session-prompts";

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

const AUTH_CREDENTIAL_ERROR_PATTERNS = [
  /authentication\s*failed/i,
  /credentials?\s+may\s+have\s+expired/i,
  /no\s+api\s+key\s+found/i,
  /oauth/i,
  /unauthorized/i,
  /invalid_grant/i,
  /token\s+expired/i,
];

function detailMessage(detail) {
  return typeof detail === "string" ? detail : detail?.message || String(detail || "");
}

function isBackendConnectionError(detail) {
  const message = detailMessage(detail);
  return BACKEND_CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function isAuthCredentialError(detail) {
  const message = detailMessage(detail);
  return AUTH_CREDENTIAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function authWarningDetail(detail) {
  const message = detailMessage(detail).trim();
  return message
    ? `OAuth/API 키 인증이 끊겼을 수 있습니다. Settings에서 다시 로그인하세요. (${message})`
    : "OAuth/API 키 인증이 끊겼을 수 있습니다. Settings에서 다시 로그인하세요.";
}

function toastText(kind, detail, context) {
  const message = TOAST_MESSAGES[kind] || TOAST_MESSAGES.success;
  return {
    title: message.title,
    detail: detail || message.detail,
    workspace: toastContextWorkspace(context),
    session: toastContextSession(context),
    prompt: toastContextPrompt(context) || detail || message.detail,
  };
}

function toastHtml(message) {
  return [
    `<span class="toast-dot" aria-hidden="true"></span>`,
    `<span class="toast-copy"><strong>${escapeHtml(message.title)}</strong>`,
    `<span class="toast-line toast-workspace" title="${escapeHtml(message.workspace)}">${escapeHtml(message.workspace)}</span>`,
    `<span class="toast-line toast-session" title="${escapeHtml(message.session)}">${escapeHtml(message.session)}</span>`,
    `<small class="toast-line toast-prompt" title="${escapeHtml(message.prompt)}">${escapeHtml(message.prompt)}</small></span>`,
  ].join("");
}

function systemToastHtml(title, detail) {
  return [
    `<span class="toast-dot" aria-hidden="true"></span>`,
    `<span class="toast-copy"><strong>${escapeHtml(title)}</strong>`,
    `<small class="toast-line toast-prompt" title="${escapeHtml(detail)}">${escapeHtml(detail)}</small></span>`,
  ].join("");
}

function toastContextWorkspace(context) {
  if (!context || typeof context === "string") return context || "워크스페이스 없음";
  return context.workspaceName || context.workspace || context.label || "워크스페이스 없음";
}

function toastContextSession(context) {
  if (!context || typeof context === "string") return "세션 없음";
  return context.sessionName || context.session || context.sessionId || "세션 없음";
}

function toastContextPrompt(context) {
  if (!context || typeof context === "string") return "";
  return context.prompt || "";
}

function toastContextSessionId(context) {
  if (!context || typeof context === "string") return undefined;
  return context.sessionId;
}

function displayName(name, id) {
  const label = String(name || "").trim();
  const value = String(id || "").trim();
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
          { type: "warning", icon: false, className: "session-toast warning" },
          { type: "error", icon: false, className: "session-toast error" },
          { type: "connection", icon: false, className: "session-toast connection" },
        ],
      });
      this.toastDismissObserver = new MutationObserver(() => this.syncToastDismissAll());
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
    notification.on(NotyfEvent.Click, (payload = {}) => {
      const event = (payload as { event?: Event }).event;
      const target = event?.target as Element | null | undefined;
      if (target?.closest?.(".notyf__dismiss")) return;
      this.activateToastSession(sessionId);
      this.dismissToast(notification);
    });
    this.syncToastDismissAll();
    return notification;
  },

  showSystemToast(type, title, detail, key = `${type}:${title}:${detail}`) {
    this.systemToastKeys ??= new Set();
    if (this.systemToastKeys.has(key)) return undefined;
    this.systemToastKeys.add(key);
    const notification = this.ensureToastRegion().open({
      type: TOAST_MESSAGES[type] ? type : "warning",
      message: systemToastHtml(title, detail),
    });
    this.syncToastDismissAll();
    return notification;
  },

  notifyUpdateAvailable(status) {
    const current = status?.currentVersion || "unknown";
    const latest = status?.latestVersion || "latest";
    this.showSystemToast(
      "warning",
      "pi-web 업데이트 가능",
      `현재 ${current}, 최신 ${latest}. pi-web update 실행 후 pi-web을 재시작하세요.`,
      `piweb-update:${current}:${latest}`,
    );
  },

  notifyPiUpdateAvailable(status) {
    const current = status?.currentVersion || "unknown";
    const latest = status?.latestVersion || "latest";
    const note = status?.note ? ` ${status.note}` : "";
    this.showSystemToast(
      "warning",
      "pi 업데이트 가능",
      `현재 ${current}, 최신 ${latest}. pi update 실행 후 pi를 재시작하세요.${note}`,
      `pi-update:${current}:${latest}`,
    );
  },

  notifyRuntimeWarning(detail) {
    const message = authWarningDetail(detail);
    this.showSystemToast("warning", "인증 경고", message, `auth:${message}`);
  },

  dismissToast(toast) {
    if (toast) this.notyf?.dismiss(toast);
    this.syncToastDismissAll();
  },

  dismissAllToasts() {
    this.notyf?.dismissAll();
    this.syncToastDismissAll();
  },

  syncToastDismissAll() {
    const region = document.querySelector(".notyf");
    if (!region) return;
    let button = region.querySelector(".toast-dismiss-all");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "toast-dismiss-all";
      button.textContent = "전체 닫기";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.dismissAllToasts();
      });
      region.prepend(button);
      this.toastDismissObserver?.observe(region, { childList: true });
    }
    const activeToasts = [...region.querySelectorAll(".notyf__toast:not(.notyf__toast--disappear)")];
    activeToasts.forEach((toast, index) => {
      toast.style.setProperty("--toast-stack-index", String(index));
      toast.style.zIndex = String(index + 1);
    });
    button.hidden = activeToasts.length === 0;
  },

  activateToastSession(sessionId) {
    if (!sessionId) return;
    this.clearUnreadCompletedSession(sessionId);
    if (sessionId === this.dataset.activeSessionId) return;
    const row = [...this.querySelectorAll(".session-row[data-session]")]
      .find((item) => item.dataset.session === sessionId);
    if (row) this.pickSession(row);
  },

  currentToastContext() {
    const sessionId = this.dataset.activeSessionId;
    return {
      workspaceName: displayName(
        this.querySelector("[data-active-workspace]")?.textContent,
        this.dataset.activeWorkspaceId,
      ),
      sessionName: displayName(
        this.querySelector("[data-active-session-title]")?.textContent,
        sessionId,
      ),
      prompt: this.readLastSessionPrompt(sessionId),
      sessionId,
    };
  },

  notifySessionCompleted(context) {
    const sessionId = toastContextSessionId(context || this.currentToastContext());
    this.markUnreadCompletedSession(sessionId);
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
    if (isAuthCredentialError(detail)) {
      this.notifyRuntimeWarning(detail);
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

  readLastSessionPrompts() {
    try {
      const raw = localStorage.getItem(LAST_SESSION_PROMPTS_KEY);
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  },

  readLastSessionPrompt(sessionId) {
    if (!sessionId) return "";
    return String(this.readLastSessionPrompts()[sessionId] || "");
  },

  writeLastSessionPrompt(sessionId, prompt) {
    if (!sessionId || !prompt) return;
    const prompts = this.readLastSessionPrompts();
    prompts[sessionId] = String(prompt).trim();
    try {
      localStorage.setItem(LAST_SESSION_PROMPTS_KEY, JSON.stringify(prompts));
    } catch {
      // Ignore storage failures; prompt text will simply be absent from future toasts.
    }
  },

  readUnreadCompletedSessions() {
    try {
      const raw = localStorage.getItem(UNREAD_COMPLETED_SESSIONS_KEY);
      const parsed = JSON.parse(raw || "[]");
      return new Set(Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : []);
    } catch {
      return new Set();
    }
  },

  writeUnreadCompletedSessions(sessions) {
    try {
      localStorage.setItem(UNREAD_COMPLETED_SESSIONS_KEY, JSON.stringify([...sessions]));
    } catch {
      // Ignore storage failures; visual state will still update for this page.
    }
  },

  markUnreadCompletedSession(sessionId) {
    if (!sessionId || sessionId === this.dataset.activeSessionId) return;
    const sessions = this.readUnreadCompletedSessions();
    sessions.add(String(sessionId));
    this.writeUnreadCompletedSessions(sessions);
    this.syncUnreadCompletedSessions();
  },

  clearUnreadCompletedSession(sessionId) {
    if (!sessionId) return;
    const sessions = this.readUnreadCompletedSessions();
    if (!sessions.delete(String(sessionId))) return;
    this.writeUnreadCompletedSessions(sessions);
    this.syncUnreadCompletedSessions();
  },

  syncUnreadCompletedSessions() {
    const sessions = this.readUnreadCompletedSessions();
    const visibleSessions = new Set();
    this.querySelectorAll(".session-row[data-session]").forEach((row) => {
      visibleSessions.add(row.dataset.session);
      row.classList.toggle("unread-completed", sessions.has(row.dataset.session));
    });
    let changed = false;
    for (const sessionId of sessions) {
      if (visibleSessions.has(sessionId)) continue;
      sessions.delete(sessionId);
      changed = true;
    }
    if (changed) this.writeUnreadCompletedSessions(sessions);
  },

  toastContextForSessionRow(row) {
    const workspaceId = row?.dataset.workspace;
    const workspaceName = this.querySelector(`[data-workspace-group='${workspaceId}'] .label`)?.textContent;
    const sessionId = row?.dataset.session;
    return {
      workspaceName: displayName(workspaceName, workspaceId),
      sessionName: displayName(row?.dataset.title, sessionId),
      prompt: this.readLastSessionPrompt(sessionId),
      sessionId,
    };
  },
};
