const SESSION_KIND_LABELS = {
  subagent: "sub",
  team: "team",
};

function normalizedSessionKind(session) {
  return SESSION_KIND_LABELS[session?.kind] ? session.kind : "";
}

export function sessionKindLabel(session) {
  const kind = normalizedSessionKind(session);
  return kind ? SESSION_KIND_LABELS[kind] : "";
}

export function decorateSessionRow(row, session) {
  const kind = normalizedSessionKind(session);
  row.classList.toggle("child-session", !!session.parentId);
  row.classList.toggle("session-kind-subagent", kind === "subagent");
  row.classList.toggle("session-kind-team", kind === "team");
  if (session.parentId) row.dataset.parentSession = session.parentId;
  else delete row.dataset.parentSession;
  if (kind) row.dataset.kind = kind;
  else delete row.dataset.kind;
}

export function appendGroupedSessionRows(container, workspaceId, sessions, createRow) {
  const sessionList = sessions || [];
  const sessionIds = new Set(sessionList.map((session) => session.id));
  const childrenByParent = groupChildrenByParent(sessionList, sessionIds);
  const roots = sessionList.filter((session) => !session.parentId || !sessionIds.has(session.parentId));
  for (const session of roots) appendSessionTree(container, workspaceId, session, createRow, childrenByParent, 0);
}

function groupChildrenByParent(sessions, sessionIds) {
  const childrenByParent = new Map();
  for (const session of sessions) {
    if (!session.parentId || !sessionIds.has(session.parentId)) continue;
    const children = childrenByParent.get(session.parentId) || [];
    children.push(session);
    childrenByParent.set(session.parentId, children);
  }
  return childrenByParent;
}

function appendSessionTree(container, workspaceId, session, createRow, childrenByParent, depth) {
  const row = createRow(workspaceId, session);
  row.dataset.depth = String(Math.min(depth, 2));
  container.append(row);
  for (const child of childrenByParent.get(session.id) || []) {
    appendSessionTree(container, workspaceId, child, createRow, childrenByParent, depth + 1);
  }
}
