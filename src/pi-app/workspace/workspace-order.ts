const WORKSPACE_ORDER_KEY = "pi.workspaceOrder";
const SESSION_ORDER_KEY = "pi.sessionOrder";

function readJSON(key: string) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function orderByIds<T extends { id: string }>(items: T[], ids: string[] = []) {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const left = rank.get(a.id);
    const right = rank.get(b.id);
    if (left === undefined && right === undefined) return 0;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    return left - right;
  });
}

export function applyStoredWorkspaceOrder(workspaces: any[] = []) {
  const workspaceOrder = readJSON(WORKSPACE_ORDER_KEY);
  const sessionOrder = readJSON(SESSION_ORDER_KEY) || {};
  return orderByIds(workspaces, Array.isArray(workspaceOrder) ? workspaceOrder : []).map((workspace) => ({
    ...workspace,
    sessions: orderByIds(workspace.sessions || [], sessionOrder[workspace.id] || []),
  }));
}

export function storeWorkspaceOrder(ids: string[]) {
  writeJSON(WORKSPACE_ORDER_KEY, ids);
}

export function storeSessionOrder(workspaceId: string, ids: string[]) {
  const current = readJSON(SESSION_ORDER_KEY) || {};
  writeJSON(SESSION_ORDER_KEY, { ...current, [workspaceId]: ids });
}
