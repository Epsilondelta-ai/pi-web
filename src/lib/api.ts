import { HttpAgent } from "@ag-ui/client";

const DEV_API_BASE = "http://127.0.0.1:8732";
const DEV_PORTS = new Set(["4321", "6006"]);

function apiBase() {
  if (globalThis.PI_WEB_API_BASE !== undefined) return globalThis.PI_WEB_API_BASE;
  if (DEV_PORTS.has(globalThis.location?.port)) return DEV_API_BASE;
  return "";
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export function health() {
  return request("/api/health");
}

export function getVersionStatus() {
  return request("/api/version");
}

export function getWorkspaces() {
  return request("/api/workspaces");
}

export function openWorkspace(path) {
  return request("/api/workspaces/open", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function cloneWorkspace(parentPath, gitUrl, name = "") {
  return request("/api/workspaces/clone", {
    method: "POST",
    body: JSON.stringify({ parentPath, gitUrl, name }),
  });
}

export function listFolders(path = "~") {
  return request(`/api/system/folders?path=${encodeURIComponent(path)}`);
}

export function getWorkspaceSessions(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`);
}

export function deleteWorkspaceSessions(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`, { method: "DELETE" });
}

export function createSession(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`, { method: "POST" });
}

export function deleteWorkspace(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
}

export function getWorkspaceFiles(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`);
}

export function getWorkspaceCommands(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/commands`);
}

export function getWorkspaceRuntimeStatus(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/runtime-status`);
}

export function getWorkspaceRuntimeModel(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/runtime-model`);
}

export function getWorkspaceRuntimeQuota(workspaceId, model = "") {
  const query = model ? `?model=${encodeURIComponent(model)}` : "";
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/runtime-quota${query}`);
}

export function getWorkspaceSettings(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/settings`);
}

export function saveWorkspaceSettings(workspaceId, scope, settings) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/settings`, {
    method: "PUT",
    body: JSON.stringify({ scope, settings }),
  });
}

export function getWorkspaceFile(workspaceId, path) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`);
}

export function saveWorkspaceFile(workspaceId, path, content) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/write?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function getGitStatus(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/git/status`);
}

export function runShellCommand(workspaceId, command) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/shell`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export function getSession(sessionId, options: { limit?: number; before?: string } = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.before) params.set("before", options.before);
  const query = params.toString() ? `?${params}` : "";
  return request(`/api/sessions/${encodeURIComponent(sessionId)}${query}`);
}

export function renameSession(sessionId, title) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteSession(sessionId) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export function cancelSession(sessionId) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" });
}

export function postPrompt(sessionId, text, attachments = []) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: "POST",
    body: JSON.stringify({ text, attachments }),
  });
}

export async function runAguiSessionPrompt(sessionId, text, attachments = [], subscriber: any = {}) {
  if (typeof EventSource === "undefined") {
    await postPrompt(sessionId, text, attachments);
    return false;
  }
  const agent = new HttpAgent({
    url: `${apiBase()}/api/sessions/${encodeURIComponent(sessionId)}/ag-ui`,
    threadId: sessionId,
    initialMessages: [
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
      },
    ],
  });
  const toolBodies = new Map<string, string>();
  const toolNames = new Map<string, string>();
  try {
    await agent.runAgent(
      {
        runId: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        forwardedProps: { text, attachments },
      },
      {
        onRunStartedEvent: () => subscriber.onRunStarted?.(),
        onTextMessageContentEvent: ({ event }: any) => subscriber.onTextDelta?.(event.delta || ""),
        onTextMessageEndEvent: ({ textMessageBuffer }: any) => subscriber.onTextEnd?.(textMessageBuffer || ""),
        onReasoningMessageContentEvent: ({ event }: any) => subscriber.onThinkingDelta?.(event.delta || ""),
        onToolCallStartEvent: ({ event }: any) => {
          const name = event.toolCallName || "tool";
          toolNames.set(event.toolCallId, name);
          toolBodies.set(event.toolCallId, "");
          subscriber.onToolStart?.({ id: event.toolCallId, name });
        },
        onToolCallArgsEvent: ({ event, toolCallName }: any) => {
          const name = toolCallName || toolNames.get(event.toolCallId) || "tool";
          const chunk = event.delta || "";
          toolBodies.set(event.toolCallId, `${toolBodies.get(event.toolCallId) || ""}${chunk}`);
          subscriber.onToolArgs?.({ id: event.toolCallId, name, chunk });
        },
        onToolCallResultEvent: ({ event }: any) => {
          const name = toolNames.get(event.toolCallId) || "tool";
          const content = event.content || "";
          toolBodies.set(event.toolCallId, content || toolBodies.get(event.toolCallId) || "");
          subscriber.onToolResult?.({ id: event.toolCallId, name, content });
        },
        onToolCallEndEvent: ({ event, toolCallName, toolCallArgs }: any) => {
          const name = toolCallName || toolNames.get(event.toolCallId) || "tool";
          subscriber.onToolEnd?.({
            id: event.toolCallId,
            name,
            args: typeof toolCallArgs === "string" ? toolCallArgs : JSON.stringify(toolCallArgs || {}),
            body: toolBodies.get(event.toolCallId) || "",
          });
        },
        onRunErrorEvent: ({ event }: any) => subscriber.onRunError?.(event.message || "AG-UI run failed"),
        onRunFinishedEvent: () => subscriber.onRunFinished?.(),
        onRunFailed: ({ error }: any) => subscriber.onRunError?.(error?.message || String(error)),
      },
    );
    return true;
  } catch (error) {
    if (String(error).includes("Failed to getReader")) {
      await postPrompt(sessionId, text, attachments);
      return false;
    }
    throw error;
  }
}

export function steerSession(sessionId, text, attachments = []) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/steer`, {
    method: "POST",
    body: JSON.stringify({ text, attachments }),
  });
}

export function sessionEvents(sessionId: string, { onEvent, onOpen, onError, replay = true }: any = {}) {
  const replayQuery = replay ? "" : "?replay=false";
  const source = new EventSource(
    `${apiBase()}/api/sessions/${encodeURIComponent(sessionId)}/events${replayQuery}`,
  );
  source.onopen = () => onOpen?.();
  source.onerror = (event) => onError?.(event);
  const types = [
    "session.message",
    "session.delta",
    "session.status",
    "session.renamed",
    "tool.started",
    "tool.output",
    "tool.finished",
    "workspace.files.changed",
    "error",
    "heartbeat",
  ];
  for (const type of types) {
    source.addEventListener(type, (message) => {
      try {
        onEvent?.(JSON.parse(message.data));
      } catch (error) {
        onError?.(error);
      }
    });
  }
  return source;
}
