import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SortableWorkspaceSidebar, { applySortableMove, reorderWorkspaceSessionList, sessionTree } from "./SortableWorkspaceSidebar";

type DndContextMockProps = {
  children: React.ReactNode;
  onDragCancel?: () => void;
  onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
  onDragStart?: (event: { active: { id: string } }) => void;
};

type SortableMockProps = { id: string };

type SortableTestGlobal = typeof globalThis & { __sortableDraggingId?: string };

type SessionTreeNode = {
  session: { title: string };
  children?: SessionTreeNode[];
};

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragStart, onDragCancel, onDragEnd }: DndContextMockProps) => <div data-dnd-context="true">
    <button type="button" data-test-drag-start onClick={() => onDragStart?.({ active: { id: "w1" } })}>drag start</button>
    <button type="button" data-test-drag-cancel onClick={() => onDragCancel?.()}>drag cancel</button>
    <button type="button" data-test-drag-end-same onClick={() => onDragEnd?.({ active: { id: "w1" }, over: { id: "w1" } })}>drag same</button>
    <button type="button" data-test-drag-end-session-same onClick={() => onDragEnd?.({ active: { id: "s1" }, over: { id: "s1" } })}>drag session same</button>
    <button type="button" data-test-drag-end-none onClick={() => onDragEnd?.({ active: { id: "w1" }, over: null })}>drag none</button>
    <button type="button" data-test-drag-end-workspace onClick={() => onDragEnd?.({ active: { id: "w1" }, over: { id: "w2" } })}>drag workspace</button>
    <button type="button" data-test-drag-end-session onClick={() => onDragEnd?.({ active: { id: "s1" }, over: { id: "s4" } })}>drag session</button>
    <button type="button" data-test-drag-end-missing onClick={() => onDragEnd?.({ active: { id: "missing" }, over: { id: "s1" } })}>drag missing</button>
    {children}
  </div>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div data-sortable-context="true">{children}</div>,
  arrayMove: <T,>(items: T[], from: number, to: number): T[] => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: ({ id }: SortableMockProps) => ({
    attributes: { "data-sortable-attributes": String(id) },
    listeners: { "data-sortable-listeners": String(id) },
    setActivatorNodeRef: (node: HTMLElement | null) => node?.setAttribute("data-sortable-activator", String(id)),
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: (globalThis as SortableTestGlobal).__sortableDraggingId === id,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => undefined } } }));

const workspaces = [
  {
    id: "w1",
    name: "one",
    path: "/one",
    sessionCount: 3,
    sessions: [
      { id: "s1", title: "root", lastUsed: "now", active: true, kind: "subagent" },
      { id: "s2", title: "child", parentId: "s1", lastUsed: "now", kind: "team" },
      { id: "s3", title: "grandchild", parentId: "s2", lastUsed: "now", live: true, kind: "unknown" },
      { id: "s4", title: "other root" },
    ],
  },
  { id: "w2", name: "two", path: "/two", sessionCount: 0, sessions: [] },
  { id: "w3", name: "three", path: "/three", sessionCount: 0, live: true },
];

function renderSidebar(props = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onWorkspaceOrder = vi.fn();
  const onSessionOrder = vi.fn();
  act(() => root.render(<SortableWorkspaceSidebar workspaces={workspaces} activeWorkspaceId="w1" activeSessionId="s1" onWorkspaceOrder={onWorkspaceOrder} onSessionOrder={onSessionOrder} {...props} />));
  return { host, root, onWorkspaceOrder, onSessionOrder };
}

describe("SortableWorkspaceSidebar", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    delete (globalThis as SortableTestGlobal).__sortableDraggingId;
  });

  it("covers sortable move and session-order helpers", () => {
    const onMove = vi.fn();
    applySortableMove(["a", "b", "c"], "a", undefined, onMove);
    applySortableMove(["a", "b", "c"], "a", "a", onMove);
    applySortableMove(["a", "b", "c"], "missing", "a", onMove);
    expect(onMove).not.toHaveBeenCalled();
    applySortableMove(["a", "b", "c"], "a", "c", onMove);
    expect(onMove).toHaveBeenCalledWith(["b", "c", "a"]);

    const workspace = { id: "w1", sessions: [{ id: "s1" }, { id: "s2" }, { id: "child", parentId: "s1" }] };
    expect(reorderWorkspaceSessionList({ id: "w2", sessions: [] }, "w1", ["s2"])).toEqual({ id: "w2", sessions: [] });
    expect(reorderWorkspaceSessionList(workspace, "w1", ["s2", "s1"]).sessions.map((session) => session.id)).toEqual(["s2", "s1", "child"]);
  });

  it("shows an empty-state row when a workspace has no sessions", () => {
    const { host, root } = renderSidebar({ activeWorkspaceId: "w2", activeSessionId: "" });

    expect(host.querySelector('[data-workspace-group="w2"] .sessions-empty')?.textContent).toContain("no sessions yet");
    expect(host.querySelector('[data-workspace-group="w2"] .new-session-row')).not.toBeNull();
    act(() => root.unmount());
  });

  it("keeps recursive session descendants visible", () => {
    expect(flattenTitles(sessionTree(workspaces[0].sessions))).toEqual(["root", "child", "grandchild", "other root"]);
    const { host, root } = renderSidebar();
    expect([...host.querySelectorAll(".session-row[data-session]")].map((row) => row.getAttribute("data-session"))).toEqual(["s1", "s2", "s3", "s4"]);
    expect(host.querySelector('[data-session="s3"]')?.getAttribute("data-depth")).toBe("2");
    expect(host.querySelector('[data-session="s1"] .session-kind-badge')?.textContent).toBe("sub");
    expect(host.querySelector('[data-session="s2"] .session-kind-badge')?.textContent).toBe("team");
    expect(host.querySelector('[data-session="s3"] .meta')?.textContent).toBe("waiting");
    act(() => root.unmount());
  });

  it("collapses every workspace session panel while a workspace is dragging", () => {
    const { host, root } = renderSidebar();
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(false);
    act(() => (host.querySelector("[data-test-drag-start]") as HTMLButtonElement).click());
    expect([...host.querySelectorAll<HTMLElement>(".sessions")].every((sessions) => sessions.hidden)).toBe(true);
    act(() => (host.querySelector("[data-test-drag-end-none]") as HTMLButtonElement).click());
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(false);
    act(() => (host.querySelector("[data-test-drag-start]") as HTMLButtonElement).click());
    act(() => (host.querySelector("[data-test-drag-cancel]") as HTMLButtonElement).click());
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(false);
    act(() => root.unmount());
  });

  it("limits drag listeners to explicit handles", () => {
    const { host, root } = renderSidebar();
    expect(host.querySelector(".workspace-sortable")?.hasAttribute("data-sortable-listeners")).toBe(false);
    expect(host.querySelector('.ws-row[data-workspace="w1"]')?.hasAttribute("data-sortable-listeners")).toBe(false);
    expect(host.querySelector('.workspace-drag-handle')?.getAttribute("data-sortable-listeners")).toBe("w1");
    expect(host.querySelector('.session-drag-handle')?.getAttribute("data-sortable-listeners")).toBe("s1");
    expect(host.querySelector('.row-action[data-workspace="w1"]')?.hasAttribute("data-sortable-listeners")).toBe(false);
    expect(host.querySelector('.session-menu-button[aria-controls="session-menu-s1"]')?.hasAttribute("data-sortable-listeners")).toBe(false);
    act(() => root.unmount());
  });

  it("honors the controlled open workspace prop during lazy mount and updates", () => {
    const { host, root } = renderSidebar({ openWorkspaceId: "w2" });
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(true);
    expect((host.querySelector('[data-workspace-group="w2"] .sessions') as HTMLElement).hidden).toBe(false);
    expect(host.querySelector('.ws-row[data-workspace="w1"]')?.getAttribute("aria-current")).toBe("true");

    act(() => root.render(<SortableWorkspaceSidebar workspaces={workspaces} activeWorkspaceId="w1" activeSessionId="s1" openWorkspaceId="" onWorkspaceOrder={vi.fn()} onSessionOrder={vi.fn()} />));
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(true);
    expect((host.querySelector('[data-workspace-group="w2"] .sessions') as HTMLElement).hidden).toBe(true);
    act(() => root.unmount());
  });

  it("tracks external workspace open state events without stale props", () => {
    const { host, root } = renderSidebar();
    act(() => window.dispatchEvent(new CustomEvent("pi-sidebar-workspace-state", { detail: { activeWorkspaceId: "w2", openWorkspaceId: "w2" } })));
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(true);
    expect((host.querySelector('[data-workspace-group="w2"] .sessions') as HTMLElement).hidden).toBe(false);
    expect(host.querySelector('.ws-row[data-workspace="w2"]')?.getAttribute("aria-current")).toBe("true");
    act(() => window.dispatchEvent(new CustomEvent("pi-sidebar-workspace-state", { detail: {} })));
    expect(host.querySelector('.ws-row[data-workspace="w2"]')?.getAttribute("aria-current")).toBe("false");
    act(() => root.unmount());
  });

  it("reorders workspaces and root sessions while guarding invalid drops", () => {
    const { host, root, onWorkspaceOrder, onSessionOrder } = renderSidebar();
    act(() => (host.querySelectorAll("[data-test-drag-end-same]")[0] as HTMLButtonElement).click());
    expect(onWorkspaceOrder).not.toHaveBeenCalled();
    act(() => (host.querySelector("[data-test-drag-end-workspace]") as HTMLButtonElement).click());
    expect(onWorkspaceOrder).toHaveBeenCalledWith(["w2", "w1", "w3"]);
    act(() => (host.querySelector('[data-workspace-group="w1"] [data-test-drag-end-session-same]') as HTMLButtonElement).click());
    act(() => (host.querySelector('[data-workspace-group="w1"] [data-test-drag-end-none]') as HTMLButtonElement).click());
    act(() => (host.querySelector('[data-workspace-group="w1"] [data-test-drag-end-session]') as HTMLButtonElement).click());
    expect(onSessionOrder).toHaveBeenCalledWith("w1", ["s4", "s1"]);
    act(() => (host.querySelector('[data-workspace-group="w1"] [data-test-drag-end-missing]') as HTMLButtonElement).click());
    act(() => (host.querySelector('[data-dnd-context="true"] > [data-test-drag-end-missing]') as HTMLButtonElement).click());
    expect(onSessionOrder).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("updates from prop changes and marks active sortable shells", () => {
    (globalThis as SortableTestGlobal).__sortableDraggingId = "w1";
    const { host, root } = renderSidebar({ activeWorkspaceId: "" });
    expect(host.querySelector('.workspace-sortable[data-dragging="true"]')).not.toBeNull();
    act(() => root.render(<SortableWorkspaceSidebar workspaces={workspaces} activeWorkspaceId="w3" activeSessionId="s3" onWorkspaceOrder={vi.fn()} onSessionOrder={vi.fn()} />));
    expect(host.querySelector('.ws-row[data-workspace="w3"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector('[data-session="s3"]')?.classList.contains("selected")).toBe(true);
    act(() => root.unmount());
  });
});

function flattenTitles(nodes: SessionTreeNode[]): string[] {
  return nodes.flatMap(({ session, children }) => [session.title, ...flattenTitles(children || [])]);
}
