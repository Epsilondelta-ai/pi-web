import { getWorkspaceSession, sessionEvents } from "../../shared/api/api";
import { parseFallbackChoices } from "../input/fallback-choices";

type BackgroundSessionWatch = {
  failed: boolean;
  row: Element;
  source?: EventSource;
  wasRunning: boolean;
  fallbackChoiceNotified: boolean;
};

const UNREAD_COMPLETED_SESSIONS_KEY = "piweb:unread-completed-sessions";
const LAST_SESSION_PROMPTS_KEY = "piweb:last-session-prompts";

export function detailMessage(detail) {
  const fallback = String(detail).replace("null", "").replace("undefined", "");
  return String(Object(detail).message).replace("undefined", fallback);
}

function isBackendConnectionError(detail) {
  const message = detailMessage(detail).toLowerCase();
  return message.includes("failed to fetch")
    || message.includes("fetch failed")
    || message.includes("load failed")
    || message.includes("network error")
    || message.includes("err_connection")
    || message.includes("connection refused")
    || message.includes("connection reset")
    || message.includes("connection closed")
    || message.includes("connection aborted")
    || message.includes("backend disconnected")
    || message.includes("event stream")
    || message.includes("body stream")
    || message.includes("terminated");
}

export function authProviderLabel(provider) {
  if (!provider) return "알 수 없음";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "github-copilot") return "GitHub Copilot";
  if (provider === "openai-codex") return "OpenAI Codex";
  if (provider === "openai") return "OpenAI";
  return provider;
}

export function notificationContextWorkspace(context) {
  if (!context || typeof context === "string") return context || "워크스페이스 없음";
  return context.workspaceName || context.workspace || context.label || "워크스페이스 없음";
}

export function notificationContextSession(context) {
  if (!context || typeof context === "string") return "세션 없음";
  return context.sessionName || context.session || context.sessionId || "세션 없음";
}

function notificationContextSessionId(context) {
  if (!context || typeof context === "string") return undefined;
  return context.sessionId;
}

function sessionContextFromRow(row) {
  return {
    parentSessionId: row?.dataset.parentSession || "",
    sessionKind: row?.dataset.kind || "",
  };
}

function displayName(name, id) {
  const label = String(name || "").trim();
  const value = String(id || "").trim();
  return label || value || "알 수 없음";
}

export const notificationMethods = {
  notifyUpdateAvailable() {},

  notifyPiUpdateAvailable() {},

  notifyPiPackageUpdateAvailable() {},

  notifyWorkspacePackageUpdateAvailable() {},

  notifyPiUpdateRunning() {},

  notifyPiUpdateComplete() {},

  notifyPiUpdateFailed() {},

  notifyRuntimeWarning() {},

  notifySessionCompleted(context) {
    const payload = context || this.currentNotificationContext?.();
    const sessionId = notificationContextSessionId(payload);
    if (sessionId) this.clearUnreadCompletedSession(sessionId);
    this.notifyRemoteNotificationPlugins?.("completed", payload);
  },

  notifyResponseCompletedOnce(context) {
    if (this.responseCompletionToastShown) return;
    this.responseCompletionToastShown = true;
    this.notifySessionCompleted(context);
  },

  notifyChoiceRequested(context) {
    this.notifyRemoteNotificationPlugins?.("choice", context || this.currentNotificationContext?.());
  },

  notifyRemoteNotificationPlugins(eventType, context) {
    for (const listener of this.remoteNotificationListeners || []) {
      try {
        listener(eventType, context);
      } catch (error) {
        console.error("Remote notification plugin failed", error);
      }
    }
  },

  notifyResponseFailure(detail) {
    if (this.responseFailureToastShown) return;
    this.responseFailureToastShown = true;
    if (isBackendConnectionError(detail)) this.setConnection?.("err");
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
    const watch: BackgroundSessionWatch = { failed: false, row, wasRunning: true, fallbackChoiceNotified: false };
    watch.source = sessionEvents(sessionId, {
      replay: false,
      onError: () => undefined,
      onEvent: (event) => this.handleBackgroundSessionEvent(event, watch),
    });
    return watch;
  },

  handleBackgroundSessionEvent(event, watch) {
    if (!event || event.type === "heartbeat") return;
    const context = this.notificationContextForSessionRow(watch.row);
    if (event.type === "error") {
      watch.failed = true;
      this.notifyResponseFailure(event.payload?.error, context);
      return;
    }
    if (event.type === "session.message" && parseFallbackChoices(event.payload?.text).length) {
      watch.fallbackChoiceNotified = true;
      this.notifyChoiceRequested(context);
      return;
    }
    if (event.type !== "session.status") return;
    const status = event.payload?.status;
    if (status === "running" || status === "thinking") watch.wasRunning = true;
    if (status !== "idle" && status !== "cancelled") return;
    this.dismissBackgroundSessionWatch(event.sessionId, watch);
    if (watch.wasRunning && status === "idle" && !watch.failed && !watch.fallbackChoiceNotified) {
      this.notifySessionCompleted(context);
      void this.readCompletedBackgroundSessionAloud(event.sessionId);
    }
  },

  dismissBackgroundSessionWatch(sessionId, watch) {
    watch.source?.close?.();
    this.backgroundSessionWatches?.delete(sessionId);
    this.markSessionRunning?.(watch.row, false);
    this.updateSessionMeta?.(watch.row, false);
    this.syncActiveWorkspaceRows?.();
  },

  async readCompletedBackgroundSessionAloud(sessionId) {
    if (!this.canReadCompletedBackgroundSessionAloud?.(sessionId)) return;
    const generation = this.readAloudGeneration || 0;
    try {
      const workspaceId = this.findWorkspaceIdForSession?.(sessionId) || this.dataset.activeWorkspaceId;
      if (!workspaceId) return;
      const result = await getWorkspaceSession(workspaceId, sessionId, { limit: 20 });
      if (!this.canReadCompletedBackgroundSessionAloud?.(sessionId) || (this.readAloudGeneration || 0) !== generation) return;
      const messages = result?.messages || [];
      const assistantMessage = [...messages].reverse().find((message) => message?.kind === "pi" && message.text);
      if (assistantMessage?.text) this.speakAssistantText?.(assistantMessage.text);
    } catch {}
  },

  canReadCompletedBackgroundSessionAloud(sessionId) {
    return !!sessionId && this.isReadAloudEnabled?.() && sessionId !== this.dataset.activeSessionId;
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
    } catch {}
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
    } catch {}
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

  currentNotificationContext() {
    const sessionId = this.dataset.activeSessionId;
    const row = sessionId ? this.querySelector(`.session-row[data-session='${sessionId}']`) : null;
    return {
      workspaceName: displayName(this.querySelector("[data-active-workspace]")?.textContent, this.dataset.activeWorkspaceId),
      sessionName: displayName(this.querySelector("[data-active-session-title]")?.textContent, sessionId),
      prompt: this.readLastSessionPrompt(sessionId),
      sessionId,
      ...sessionContextFromRow(row),
    };
  },

  notificationContextForSessionRow(row) {
    const workspaceId = row?.dataset.workspace;
    const workspaceName = this.querySelector(`[data-workspace-group='${workspaceId}'] .label`)?.textContent;
    const sessionId = row?.dataset.session;
    return {
      workspaceName: displayName(workspaceName, workspaceId),
      sessionName: displayName(row?.dataset.title, sessionId),
      prompt: this.readLastSessionPrompt(sessionId),
      sessionId,
      ...sessionContextFromRow(row),
    };
  },
};
