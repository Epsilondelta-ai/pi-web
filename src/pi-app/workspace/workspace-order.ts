const WORKSPACE_ORDER_KEY = "pi.workspaceOrder";
const SESSION_ORDER_KEY = "pi.sessionOrder";

function readJSON(key: string): unknown {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function orderByIds<T extends { id: string }>(items: T[], ids: string[] = []): T[] {
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

type OrderedSession = { id: string };

type OrderedWorkspace = {
  id: string;
  sessions?: OrderedSession[];
  [key: string]: unknown;
};

type SessionOrder = Record<string, string[]>;

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readSessionOrder(value: unknown): SessionOrder {
  return typeof value === "object" && value !== null ? (value as SessionOrder) : {};
}

export function applyStoredWorkspaceOrder<T extends OrderedWorkspace>(workspaces: T[] = []): T[] {
  const workspaceOrder = readStringArray(readJSON(WORKSPACE_ORDER_KEY));
  const sessionOrder = readSessionOrder(readJSON(SESSION_ORDER_KEY));
  return orderByIds(workspaces, workspaceOrder).map((workspace) => ({
    ...workspace,
    sessions: orderByIds(workspace.sessions || [], sessionOrder[workspace.id] || []),
  }));
}

export function storeWorkspaceOrder(ids: string[]): void {
  writeJSON(WORKSPACE_ORDER_KEY, ids);
}

export function storeSessionOrder(workspaceId: string, ids: string[]): void {
  const current = readSessionOrder(readJSON(SESSION_ORDER_KEY));
  writeJSON(SESSION_ORDER_KEY, { ...current, [workspaceId]: ids });
}
