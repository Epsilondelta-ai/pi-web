const ACTIVE_SESSION_KEY = "pi.activeSession";

export function readStoredActiveSession() {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.sessionId !== "string" || !parsed.sessionId) return undefined;
    return {
      workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : "",
      sessionId: parsed.sessionId,
    };
  } catch {
    return undefined;
  }
}

export function storeActiveSession(workspaceId, sessionId) {
  if (!sessionId) return;
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ workspaceId: workspaceId || "", sessionId }));
  } catch {}
}

export function clearStoredActiveSession(sessionId) {
  try {
    const stored = readStoredActiveSession();
    if (!sessionId || stored?.sessionId === sessionId) localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {}
}
