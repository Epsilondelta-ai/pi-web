import React from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const X_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
const PLUS_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>;
const TRASH_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
const ELLIPSIS_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>;
const PENCIL_ICON = <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></svg>;

const KIND_LABELS = { subagent: "sub", team: "team" };

function SortableShell({ id, className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <div ref={setNodeRef} className={className} style={{ transform: CSS.Transform.toString(transform), transition }} data-dragging={isDragging ? "true" : undefined} {...attributes} {...listeners}>{children}</div>;
}

function sessionTree(sessions) {
  const ids = new Set(sessions.map((session) => session.id));
  const children = new Map();
  for (const session of sessions) {
    if (!session.parentId || !ids.has(session.parentId)) continue;
    children.set(session.parentId, [...(children.get(session.parentId) || []), session]);
  }
  return sessions
    .filter((session) => !session.parentId || !ids.has(session.parentId))
    .map((session) => ({ session, children: children.get(session.id) || [] }));
}

function SessionRow({ workspaceId, session, activeSessionId, depth = 0 }) {
  const kind = KIND_LABELS[session.kind] ? session.kind : "";
  const live = !!(session.active || session.live);
  const selected = session.id === activeSessionId;
  const menuId = `session-menu-${session.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return <div className={["session-row", selected && "selected", live && "active", session.parentId && "child-session", kind && `session-kind-${kind}`].filter(Boolean).join(" ")} data-session={session.id} data-workspace={workspaceId} data-title={session.title} data-last-used={session.lastUsed || ""} data-parent-session={session.parentId || undefined} data-kind={kind || undefined} data-depth={Math.min(depth, 2)}>
    <button type="button" className="session-main" data-session={session.id} data-workspace={workspaceId} data-title={session.title}>
      <span className="session-title"><span className="title">{session.title}</span>{kind ? <span className="session-kind-badge">{KIND_LABELS[kind]}</span> : null}</span>
      <span className={["meta", live && "live"].filter(Boolean).join(" ")}>{live ? "waiting" : ""}</span>
    </button>
    <button type="button" className="session-menu-button" data-action="session-menu-toggle" aria-haspopup="true" aria-expanded="false" aria-controls={menuId} aria-label="session actions">{ELLIPSIS_ICON}</button>
    <div className="session-menu" id={menuId} role="menu" hidden>
      <button type="button" role="menuitem" data-action="rename-session">{PENCIL_ICON}<span>rename</span></button>
      <button type="button" role="menuitem" className="danger" data-action="delete-session">{TRASH_ICON}<span>delete</span></button>
    </div>
  </div>;
}

function WorkspaceGroup({ workspace, activeWorkspaceId, activeSessionId, onSessionOrder }) {
  const open = workspace.id === activeWorkspaceId;
  const hasActiveSession = (workspace.sessions || []).some((session) => session.active || session.live);
  const roots = sessionTree(workspace.sessions || []);
  const rootIds = roots.map(({ session }) => session.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleSessionDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = rootIds.indexOf(active.id);
    const newIndex = rootIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onSessionOrder(workspace.id, arrayMove(rootIds, oldIndex, newIndex));
  };
  return <div className={["workspace-group", open && "active", hasActiveSession && "has-active-session"].filter(Boolean).join(" ")} data-workspace-group={workspace.id}>
    <div className="workspace-shell">
      <button type="button" className={["ws-row", open && "open", open && "active", hasActiveSession && "has-active-session"].filter(Boolean).join(" ")} data-action="toggle-workspace" data-workspace={workspace.id} aria-expanded={open ? "true" : "false"} aria-current={open ? "true" : "false"}>
        <span className="ws-stack"><span className="ws-name"><span className={["dot", (workspace.live || hasActiveSession) && "live"].filter(Boolean).join(" ")}></span><span className="label">{workspace.name}</span></span><span className="ws-path">{workspace.path}</span></span>
        <span className="ws-meta"><span className="ws-count">{workspace.sessionCount}</span></span>
      </button>
      <button type="button" className="row-action danger" data-action="delete-workspace" data-workspace={workspace.id} title="remove workspace" aria-label="remove workspace">{X_ICON}</button>
    </div>
    <div className="sessions" hidden={!open}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSessionDragEnd}>
        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
          {roots.map(({ session, children }) => <SortableShell key={session.id} id={session.id} className="session-sortable">
            <SessionRow workspaceId={workspace.id} session={session} activeSessionId={activeSessionId} />
            {(children || []).map((child) => <SessionRow key={child.id} workspaceId={workspace.id} session={child} activeSessionId={activeSessionId} depth={1} />)}
          </SortableShell>)}
        </SortableContext>
      </DndContext>
      {(workspace.sessions || []).length > 0 ? <button type="button" className="session-row clear-sessions-row" data-action="delete-workspace-sessions" data-workspace={workspace.id}><span className="title">{TRASH_ICON} delete all sessions</span></button> : null}
      <button type="button" className="session-row new-session-row" data-action="new-session" data-workspace={workspace.id}><span className="title">{PLUS_ICON} new session</span></button>
    </div>
  </div>;
}

export default function SortableWorkspaceSidebar({ workspaces, activeWorkspaceId, activeSessionId, onWorkspaceOrder, onSessionOrder }) {
  const ids = workspaces.map((workspace) => workspace.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleWorkspaceDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onWorkspaceOrder(arrayMove(ids, oldIndex, newIndex));
  };
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleWorkspaceDragEnd}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {workspaces.map((workspace) => <SortableShell key={workspace.id} id={workspace.id} className="workspace-sortable"><WorkspaceGroup workspace={workspace} activeWorkspaceId={activeWorkspaceId} activeSessionId={activeSessionId} onSessionOrder={onSessionOrder} /></SortableShell>)}
    </SortableContext>
  </DndContext>;
}
