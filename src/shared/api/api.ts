const DEV_API_BASE = "http://127.0.0.1:8732";

export type PluginEvent = {
  id?: number;
  type: string;
  payload?: unknown;
  at?: string;
};

function isLoopbackDevHost(): boolean {
  const hostname = globalThis.location?.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function apiBase(): string {
  if (globalThis.PI_WEB_API_BASE !== undefined) return globalThis.PI_WEB_API_BASE;
  if (import.meta.env.DEV && isLoopbackDevHost()) return DEV_API_BASE;
  return "";
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
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

export function health() { return request("/api/health"); }
export function getVersionStatus() { return request("/api/version"); }
export function getPiVersionStatus() { return request("/api/pi/version"); }
export function getPiUpdateStatus() { return request("/api/pi/update"); }
export function getPlugins() { return request("/api/plugins"); }
export function getPluginUpdates() { return request("/api/plugins/updates"); }
export function connectPluginEvents(
  pluginId: string,
  channel: string,
  onEvent: (event: PluginEvent) => void,
  eventTypes: string[] = [],
): () => void {
  if (typeof EventSource === "undefined") return (): void => undefined;

  const path = `/api/plugins/${encodeURIComponent(pluginId)}/events/${encodeURIComponent(channel)}`;
  const source = new EventSource(`${apiBase()}${path}`);
  const handleEvent = (message: MessageEvent<string>): void => {
    const parsed = JSON.parse(message.data) as PluginEvent;
    onEvent(parsed);
  };
  source.onmessage = eventTypes.length === 0 ? handleEvent : null;
  eventTypes.forEach((eventType: string): void => source.addEventListener(eventType, handleEvent as EventListener));
  return (): void => source.close();
}
export function publishPluginEvent(pluginId: string, channel: string, type: string, payload: unknown = {}) {
  const path = `/api/plugins/${encodeURIComponent(pluginId)}/events/${encodeURIComponent(channel)}`;
  return request(path, { method: "POST", body: JSON.stringify({ payload, type }) });
}
export function getAuthProviders() { return request("/api/auth/providers"); }
export function getOAuthProviders() { return request("/api/auth/oauth/providers"); }
export function getWorkspaceModels(workspaceId) { return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/models`); }
export function getWorkspaceRuntimeStatus(workspaceId) { return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/runtime-status`); }
export function getWorkspaceSettings(workspaceId) { return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/settings`); }
export function getWorkspaceCommands(workspaceId, options: { reload?: boolean } = {}) {
  const query = options.reload ? "?reload=1" : "";
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/commands${query}`);
}
export function getPiPackageUpdateStatus(workspaceId?: string) {
  const path = workspaceId ? `/api/pi/package-updates?workspaceId=${encodeURIComponent(workspaceId)}` : "/api/pi/package-updates";
  return request(path);
}
export function installPlugin(source, value) {
  const body = source === "github" ? { source, url: value } : { source: "local", path: value };
  return request("/api/plugins/install", { method: "POST", body: JSON.stringify(body) });
}
export function reloadPlugins() { return request("/api/plugins/reload", { method: "POST" }); }
export function updatePlugin(pluginId) { return request(`/api/plugins/${encodeURIComponent(pluginId)}/update`, { method: "POST" }); }
export function setPluginEnabled(pluginId, enabled) {
  const action = enabled ? "enable" : "disable";
  return request(`/api/plugins/${encodeURIComponent(pluginId)}/${action}`, { method: "POST" });
}
export function uninstallPlugin(pluginId) { return request(`/api/plugins/${encodeURIComponent(pluginId)}`, { method: "DELETE" }); }
export function startPiUpdate(source = "", workspaceId = "") {
  return request("/api/pi/update", {
    method: "POST",
    headers: { "X-Pi-Web-Request": "pi-update" },
    body: JSON.stringify({ source, workspaceId }),
  });
}
export function saveAPIKey(provider, apiKey) {
  return request("/api/auth/api-key", { method: "POST", body: JSON.stringify({ provider, apiKey }) });
}
export function startOAuthLogin(provider) {
  return request("/api/auth/oauth/start", { method: "POST", body: JSON.stringify({ provider }) });
}
export function getOAuthLoginSession(sessionId) { return request(`/api/auth/oauth/sessions/${encodeURIComponent(sessionId)}`); }
export function sendOAuthLoginInput(sessionId, value) {
  return request(`/api/auth/oauth/sessions/${encodeURIComponent(sessionId)}/input`, { method: "POST", body: JSON.stringify({ value }) });
}
export function logoutProvider(provider) { return request(`/api/auth/${encodeURIComponent(provider)}`, { method: "DELETE" }); }
export function openWorkspace(path) { return request("/api/workspaces/open", { method: "POST", body: JSON.stringify({ path }) }); }
export function deleteWorkspace(workspaceId) { return request(`/api/workspaces/${encodeURIComponent(workspaceId)}`, { method: "DELETE" }); }
export function saveWorkspaceSettings(workspaceId, scope, settings) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/settings`, { method: "PUT", body: JSON.stringify({ scope, settings }) });
}
