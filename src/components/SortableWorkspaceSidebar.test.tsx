import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SortableWorkspaceSidebar, { sessionTree } from "./SortableWorkspaceSidebar";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragStart, onDragCancel, onDragEnd }: any) => <div data-dnd-context="true">
    <button type="button" data-test-drag-start onClick={() => onDragStart?.({ active: { id: "w1" } })}>drag start</button>
    <button type="button" data-test-drag-cancel onClick={() => onDragCancel?.()}>drag cancel</button>
    <button type="button" data-test-drag-end onClick={() => onDragEnd?.({ active: { id: "w1" }, over: { id: "w1" } })}>drag end</button>
    {children}
  </div>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => <div data-sortable-context="true">{children}</div>,
  arrayMove: (items: any[], from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: ({ id }: any) => ({
    attributes: { "data-sortable-attributes": String(id) },
    listeners: { "data-sortable-listeners": String(id) },
    setActivatorNodeRef: (node: HTMLElement | null) => node?.setAttribute("data-sortable-activator", String(id)),
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
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
      { id: "s1", title: "root", lastUsed: "now" },
      { id: "s2", title: "child", parentId: "s1", lastUsed: "now" },
      { id: "s3", title: "grandchild", parentId: "s2", lastUsed: "now" },
    ],
  },
  { id: "w2", name: "two", path: "/two", sessionCount: 0, sessions: [] },
];

function renderSidebar() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<SortableWorkspaceSidebar workspaces={workspaces} activeWorkspaceId="w1" activeSessionId="s1" onWorkspaceOrder={vi.fn()} onSessionOrder={vi.fn()} />));
  return { host, root };
}

describe("SortableWorkspaceSidebar", () => {
  beforeEach(() => document.body.replaceChildren());

  it("keeps recursive session descendants visible", () => {
    expect(flattenTitles(sessionTree(workspaces[0].sessions))).toEqual(["root", "child", "grandchild"]);
    const { host, root } = renderSidebar();
    expect([...host.querySelectorAll(".session-row[data-session]")].map((row) => row.getAttribute("data-session"))).toEqual(["s1", "s2", "s3"]);
    expect(host.querySelector('[data-session="s3"]')?.getAttribute("data-depth")).toBe("2");
    act(() => root.unmount());
  });

  it("collapses every workspace session panel while a workspace is dragging", () => {
    const { host, root } = renderSidebar();
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(false);
    act(() => (host.querySelector("[data-test-drag-start]") as HTMLButtonElement).click());
    expect([...host.querySelectorAll<HTMLElement>(".sessions")].every((sessions) => sessions.hidden)).toBe(true);
    act(() => (host.querySelector("[data-test-drag-cancel]") as HTMLButtonElement).click());
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(false);
    act(() => root.unmount());
  });

  it("limits workspace drag listeners to the workspace row handle", () => {
    const { host, root } = renderSidebar();
    expect(host.querySelector(".workspace-sortable")?.hasAttribute("data-sortable-listeners")).toBe(false);
    expect(host.querySelector('.ws-row[data-workspace="w1"]')?.getAttribute("data-sortable-listeners")).toBe("w1");
    expect(host.querySelector('.row-action[data-workspace="w1"]')?.hasAttribute("data-sortable-listeners")).toBe(false);
    expect(host.querySelector('.session-menu-button[aria-controls="session-menu-s1"]')?.hasAttribute("data-sortable-listeners")).toBe(false);
    act(() => root.unmount());
  });

  it("tracks external workspace open state events without stale props", () => {
    const { host, root } = renderSidebar();
    act(() => window.dispatchEvent(new CustomEvent("pi-sidebar-workspace-state", { detail: { activeWorkspaceId: "w2", openWorkspaceId: "w2" } })));
    expect((host.querySelector('[data-workspace-group="w1"] .sessions') as HTMLElement).hidden).toBe(true);
    expect((host.querySelector('[data-workspace-group="w2"] .sessions') as HTMLElement).hidden).toBe(false);
    expect(host.querySelector('.ws-row[data-workspace="w2"]')?.getAttribute("aria-current")).toBe("true");
    act(() => root.unmount());
  });
});

function flattenTitles(nodes: any[]): string[] {
  return nodes.flatMap(({ session, children }) => [session.title, ...flattenTitles(children || [])]);
}
