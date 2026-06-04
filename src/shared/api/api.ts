const DEV_API_BASE = "http://127.0.0.1:8732";

function isLoopbackDevHost(): boolean {
  const hostname = globalThis.location?.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

type JsonRecord = Record<string, unknown>;

type Attachment = JsonRecord;

type AguiSubscriber = {
  onRunStarted?: () => void;
  onTextDelta?: (delta: string) => void;
  onTextEnd?: (text: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onToolStart?: (tool: { id: string; name: string }) => void;
  onToolArgs?: (tool: { id: string; name: string; chunk: string }) => void;
  onToolResult?: (tool: { id: string; name: string; content: string }) => void;
  onToolEnd?: (tool: { id: string; name: string; args: string; body: string }) => void;
  onRunError?: (message: string) => void;
  onRunFinished?: () => void;
};

type SessionEventOptions = {
  onEvent?: (event: unknown) => void;
  onOpen?: () => void;
  onError?: (event: unknown) => void;
  replay?: boolean;
};

export function apiBase(): string {
  if (globalThis.PI_WEB_API_BASE !== undefined) return globalThis.PI_WEB_API_BASE;
  if (import.meta.env.DEV && isLoopbackDevHost()) return DEV_API_BASE;
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

export function getPiVersionStatus() {
  return request("/api/pi/version");
}

export function getPiPackageUpdateStatus(workspaceId?: string) {
  const path = workspaceId
    ? `/api/pi/package-updates?workspaceId=${encodeURIComponent(workspaceId)}`
    : "/api/pi/package-updates";
  return request(path);
}

export function getPiUpdateStatus() {
  return request("/api/pi/update");
}

export function getPlugins() {
  return request("/api/plugins");
}

export function getPluginUpdates() {
  return request("/api/plugins/updates");
}

export function installPlugin(source, value) {
  const body = source === "github" ? { source, url: value } : { source: "local", path: value };
  return request("/api/plugins/install", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function reloadPlugins() {
  return request("/api/plugins/reload", { method: "POST" });
}

export function updatePlugin(pluginId) {
  return request(`/api/plugins/${encodeURIComponent(pluginId)}/update`, { method: "POST" });
}

export function setPluginEnabled(pluginId, enabled) {
  const action = enabled ? "enable" : "disable";
  return request(`/api/plugins/${encodeURIComponent(pluginId)}/${action}`, { method: "POST" });
}

export function uninstallPlugin(pluginId) {
  return request(`/api/plugins/${encodeURIComponent(pluginId)}`, { method: "DELETE" });
}

export function startPiUpdate(source = "", workspaceId = "") {
  return request("/api/pi/update", {
    method: "POST",
    headers: { "X-Pi-Web-Request": "pi-update" },
    body: JSON.stringify({ source, workspaceId }),
  });
}

export function getWorkspaces() {
  return request("/api/workspaces");
}

export function getAuthProviders() {
  return request("/api/auth/providers");
}

export function saveAPIKey(provider, apiKey) {
  return request("/api/auth/api-key", {
    method: "POST",
    body: JSON.stringify({ provider, apiKey }),
  });
}

export function getOAuthProviders() {
  return request("/api/auth/oauth/providers");
}

export function startOAuthLogin(provider) {
  return request("/api/auth/oauth/start", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}

export function getOAuthLoginSession(sessionId) {
  return request(`/api/auth/oauth/sessions/${encodeURIComponent(sessionId)}`);
}

export function sendOAuthLoginInput(sessionId, value) {
  return request(`/api/auth/oauth/sessions/${encodeURIComponent(sessionId)}/input`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}

export function logoutProvider(provider) {
  return request(`/api/auth/${encodeURIComponent(provider)}`, { method: "DELETE" });
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

export function searchWorkspaceFiles(workspaceId, query) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/search?q=${encodeURIComponent(query)}`);
}

export function getWorkspaceCommands(workspaceId, options: { reload?: boolean } = {}) {
  const query = options.reload ? "?reload=1" : "";
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/commands${query}`);
}

export function getWorkspaceModels(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/models`);
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

export function createWorkspaceFile(workspaceId, path, kind = "file", content = "") {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/create`, {
    method: "POST",
    body: JSON.stringify({ path, kind, content }),
  });
}

export function renameWorkspaceFile(workspaceId, oldPath, newPath) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/rename`, {
    method: "PATCH",
    body: JSON.stringify({ oldPath, newPath }),
  });
}

export function deleteWorkspaceFile(workspaceId, path) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/delete`, {
    method: "DELETE",
    body: JSON.stringify({ path }),
  });
}

export function uploadWorkspaceFile(workspaceId, path, content, overwrite = false) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/upload`, {
    method: "POST",
    body: JSON.stringify({ path, content, overwrite }),
  });
}

export function getGitStatus(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/git/status`);
}

export function getGitHistory(workspaceId, limit = 80) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/git/history?limit=${encodeURIComponent(limit)}`);
}

export function getGitCommit(workspaceId, hash) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/git/commit?hash=${encodeURIComponent(hash)}`);
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

export async function runAguiSessionPrompt(
  sessionId: string,
  text: string,
  attachments: Attachment[] = [],
  subscriber: AguiSubscriber = {},
) {
  if (typeof EventSource === "undefined") {
    await postPrompt(sessionId, text, attachments);
    return false;
  }
  const { HttpAgent } = await import("@ag-ui/client");
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
        onTextMessageContentEvent: ({ event }) => subscriber.onTextDelta?.(event.delta || ""),
        onTextMessageEndEvent: ({ textMessageBuffer }) => subscriber.onTextEnd?.(textMessageBuffer || ""),
        onReasoningMessageContentEvent: ({ event }) => subscriber.onThinkingDelta?.(event.delta || ""),
        onToolCallStartEvent: ({ event }) => {
          const id = event.toolCallId;
          const name = event.toolCallName || "tool";
          toolNames.set(id, name);
          toolBodies.set(id, "");
          subscriber.onToolStart?.({ id, name });
        },
        onToolCallArgsEvent: ({ event, toolCallName }) => {
          const id = event.toolCallId;
          const name = toolCallName || toolNames.get(id) || "tool";
          const chunk = event.delta || "";
          toolBodies.set(id, `${toolBodies.get(id) || ""}${chunk}`);
          subscriber.onToolArgs?.({ id, name, chunk });
        },
        onToolCallResultEvent: ({ event }) => {
          const id = event.toolCallId;
          const name = toolNames.get(id) || "tool";
          const content = event.content || "";
          toolBodies.set(id, content || toolBodies.get(id) || "");
          subscriber.onToolResult?.({ id, name, content });
        },
        onToolCallEndEvent: ({ event, toolCallName, toolCallArgs }) => {
          const id = event.toolCallId;
          const name = toolCallName || toolNames.get(id) || "tool";
          subscriber.onToolEnd?.({
            id,
            name,
            args: typeof toolCallArgs === "string" ? toolCallArgs : JSON.stringify(toolCallArgs || {}),
            body: toolBodies.get(id) || "",
          });
        },
        onRunErrorEvent: ({ event }) => subscriber.onRunError?.(event.message || "AG-UI run failed"),
        onRunFinishedEvent: () => subscriber.onRunFinished?.(),
        onRunFailed: ({ error }) => subscriber.onRunError?.(error?.message || String(error)),
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

export function sessionEvents(
  sessionId: string,
  { onEvent, onOpen, onError, replay = true }: SessionEventOptions = {},
) {
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
