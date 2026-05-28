import React, { useEffect, useMemo, useState } from "react";
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
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handleProps = { ...attributes, ...listeners, ref: setActivatorNodeRef, "data-drag-handle": id };
  return <div ref={setNodeRef} className={className} style={{ transform: CSS.Transform.toString(transform), transition }} data-dragging={isDragging ? "true" : undefined}>{children(handleProps)}</div>;
}

export function sessionTree(sessions) {
  const ids = new Set(sessions.map((session) => session.id));
  const childrenByParent = new Map();
  for (const session of sessions) {
    if (!session.parentId || !ids.has(session.parentId)) continue;
    childrenByParent.set(session.parentId, [...(childrenByParent.get(session.parentId) || []), session]);
  }
  const toNode = (session) => ({
    session,
    children: (childrenByParent.get(session.id) || []).map(toNode),
  });
  return sessions.filter((session) => !session.parentId || !ids.has(session.parentId)).map(toNode);
}

function flattenTree(nodes, depth = 0) {
  return nodes.flatMap(({ session, children = [] }) => [
    { session, depth },
    ...flattenTree(children, depth + 1),
  ]);
}

function SessionRow({ workspaceId, session, activeSessionId, depth = 0, dragHandleProps = {} }) {
  const kind = KIND_LABELS[session.kind] ? session.kind : "";
  const live = !!(session.active || session.live);
  const selected = session.id === activeSessionId;
  const menuId = `session-menu-${session.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return <div className={["session-row", selected && "selected", live && "active", session.parentId && "child-session", kind && `session-kind-${kind}`].filter(Boolean).join(" ")} data-session={session.id} data-workspace={workspaceId} data-title={session.title} data-last-used={session.lastUsed || ""} data-parent-session={session.parentId || undefined} data-kind={kind || undefined} data-depth={Math.min(depth, 2)}>
    <button type="button" className="session-main" data-session={session.id} data-workspace={workspaceId} data-title={session.title} {...dragHandleProps}>
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

export function applySortableMove(ids, activeId, overId, onMove) {
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  const canMove = Number(Boolean(overId)) * Number(activeId !== overId) * Number(oldIndex >= 0) * Number(newIndex >= 0);
  const next = arrayMove(ids, canMove * oldIndex, canMove * newIndex);
  [() => undefined, () => onMove(next)][canMove]();
}

export function reorderWorkspaceSessionList(workspace, workspaceId, sessionIds) {
  const orderedRootIdSet = new Set(sessionIds);
  const byId = new Map(workspace.sessions.map((session) => [session.id, session]));
  const orderedRoots = sessionIds.map((id) => byId.get(id)).filter(Boolean);
  const remainingSessions = workspace.sessions.filter((session) => !orderedRootIdSet.has(session.id));
  const reordered = { ...workspace, sessions: [...orderedRoots, ...remainingSessions] };
  return [reordered, workspace][Number(workspace.id !== workspaceId)];
}

function WorkspaceGroup({ workspace, activeWorkspaceId, openWorkspaceId, activeSessionId, isWorkspaceDragging, onSessionOrder, dragHandleProps }) {
  const active = workspace.id === activeWorkspaceId;
  const open = !isWorkspaceDragging && workspace.id === openWorkspaceId;
  const hasActiveSession = workspace.sessions.some((session) => session.active || session.live);
  const roots = sessionTree(workspace.sessions);
  const rootIds = roots.map(({ session }) => session.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleSessionDragEnd = ({ active, over }) => {
    applySortableMove(rootIds, active.id, over?.id, (nextIds) => onSessionOrder(workspace.id, nextIds));
  };
  return <div className={["workspace-group", active && "active", hasActiveSession && "has-active-session"].filter(Boolean).join(" ")} data-workspace-group={workspace.id}>
    <div className="workspace-shell">
      <button type="button" className={["ws-row", open && "open", active && "active", hasActiveSession && "has-active-session"].filter(Boolean).join(" ")} data-action="toggle-workspace" data-workspace={workspace.id} aria-expanded={open ? "true" : "false"} aria-current={active ? "true" : "false"} {...dragHandleProps}>
        <span className="ws-stack"><span className="ws-name"><span className={["dot", (workspace.live || hasActiveSession) && "live"].filter(Boolean).join(" ")}></span><span className="label">{workspace.name}</span></span><span className="ws-path">{workspace.path}</span></span>
        <span className="ws-meta"><span className="ws-count">{workspace.sessionCount}</span></span>
      </button>
      <button type="button" className="row-action danger" data-action="delete-workspace" data-workspace={workspace.id} title="remove workspace" aria-label="remove workspace">{X_ICON}</button>
    </div>
    <div className="sessions" hidden={!open}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSessionDragEnd}>
        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
          {roots.map(({ session, children }) => <SortableShell key={session.id} id={session.id} className="session-sortable">
            {(sessionDragHandleProps) => flattenTree([{ session, children }]).map(({ session: treeSession, depth }, index) => <SessionRow key={treeSession.id} workspaceId={workspace.id} session={treeSession} activeSessionId={activeSessionId} depth={depth} dragHandleProps={index === 0 ? sessionDragHandleProps : null} />)}
          </SortableShell>)}
        </SortableContext>
      </DndContext>
      {workspace.sessions.length > 0 ? <button type="button" className="session-row clear-sessions-row" data-action="delete-workspace-sessions" data-workspace={workspace.id}><span className="title">{TRASH_ICON} delete all sessions</span></button> : <div className="sessions-empty">no sessions yet · press N to start one</div>}
      <button type="button" className="session-row new-session-row" data-action="new-session" data-workspace={workspace.id}><span className="title">{PLUS_ICON} new session</span></button>
    </div>
  </div>;
}

function normalizeWorkspaces(workspaces) {
  return workspaces.map((workspace) => ({ ...workspace, sessions: workspace.sessions || [] }));
}

export default function SortableWorkspaceSidebar({ workspaces, activeWorkspaceId, activeSessionId, openWorkspaceId: controlledOpenWorkspaceId = activeWorkspaceId || "", onWorkspaceOrder, onSessionOrder }) {
  const [orderedWorkspaces, setOrderedWorkspaces] = useState(() => normalizeWorkspaces(workspaces));
  const [currentActiveWorkspaceId, setCurrentActiveWorkspaceId] = useState(activeWorkspaceId || "");
  const [openWorkspaceId, setOpenWorkspaceId] = useState(controlledOpenWorkspaceId || "");
  const [isWorkspaceDragging, setIsWorkspaceDragging] = useState(false);
  useEffect(() => setOrderedWorkspaces(normalizeWorkspaces(workspaces)), [workspaces]);
  useEffect(() => {
    setCurrentActiveWorkspaceId(activeWorkspaceId || "");
    setOpenWorkspaceId(controlledOpenWorkspaceId || "");
  }, [activeWorkspaceId, controlledOpenWorkspaceId]);
  useEffect(() => {
    const handleWorkspaceState = (event) => {
      setCurrentActiveWorkspaceId(event.detail?.activeWorkspaceId || "");
      setOpenWorkspaceId(event.detail?.openWorkspaceId || "");
    };
    window.addEventListener("pi-sidebar-workspace-state", handleWorkspaceState);
    return () => window.removeEventListener("pi-sidebar-workspace-state", handleWorkspaceState);
  }, []);
  const ids = useMemo(() => orderedWorkspaces.map((workspace) => workspace.id), [orderedWorkspaces]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleWorkspaceDragEnd = ({ active, over }) => {
    setIsWorkspaceDragging(false);
    applySortableMove(ids, active.id, over?.id, (nextIds) => {
      const orderedById = new Map(orderedWorkspaces.map((workspace) => [workspace.id, workspace]));
      const next = nextIds.map((id) => orderedById.get(id)).filter(Boolean);
      setOrderedWorkspaces(next);
      onWorkspaceOrder(nextIds);
    });
  };
  const handleSessionOrder = (workspaceId, sessionIds) => {
    setOrderedWorkspaces((current) => current.map((workspace) => reorderWorkspaceSessionList(workspace, workspaceId, sessionIds)));
    onSessionOrder(workspaceId, sessionIds);
  };
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setIsWorkspaceDragging(true)} onDragCancel={() => setIsWorkspaceDragging(false)} onDragEnd={handleWorkspaceDragEnd}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {orderedWorkspaces.map((workspace) => <SortableShell key={workspace.id} id={workspace.id} className="workspace-sortable">
        {(dragHandleProps) => <WorkspaceGroup workspace={workspace} activeWorkspaceId={currentActiveWorkspaceId} openWorkspaceId={openWorkspaceId} activeSessionId={activeSessionId} isWorkspaceDragging={isWorkspaceDragging} onSessionOrder={handleSessionOrder} dragHandleProps={dragHandleProps} />}
      </SortableShell>)}
    </SortableContext>
  </DndContext>;
}
