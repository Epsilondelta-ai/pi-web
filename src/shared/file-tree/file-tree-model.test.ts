import { describe, expect, it } from "vitest";
import { decorateFileTree, isDirtyStatus } from "./file-tree-model";

const tree = [
  {
    type: "dir",
    name: "src",
    path: "src",
    children: [
      { type: "file", name: "main.ts", path: "src/main.ts" },
      { type: "file", name: "new.ts", path: "src/new.ts" },
      { type: "file", name: "gone.ts", path: "src/gone.ts" },
      { type: "file", name: "renamed.ts", path: "src/renamed.ts" },
      { type: "file", name: "clean.ts", path: "src/clean.ts" },
    ],
  },
  { type: "file", name: "README.md", path: "README.md" },
];

describe("decorateFileTree", () => {
  it("adds git status, selected state, and dirty folder ancestors", () => {
    const [src, readme] = decorateFileTree(tree, {
      "src/main.ts": "modified",
      "src/new.ts": "untracked",
      "src/gone.ts": "deleted",
      "src/renamed.ts": "renamed",
      "README.md": "added",
    }, "src/main.ts", new Set(["src"]));

    expect(src.kind).toBe("dir");
    expect(src.expanded).toBe(true);
    expect(src.dirtyDescendants).toBe(true);
    expect(src.children?.map((child) => [child.path, child.gitStatus, child.selected])).toEqual([
      ["src/main.ts", "modified", true],
      ["src/new.ts", "untracked", false],
      ["src/gone.ts", "deleted", false],
      ["src/renamed.ts", "renamed", false],
      ["src/clean.ts", "clean", false],
    ]);
    expect(readme.gitStatus).toBe("added");
  });

  it("treats unknown statuses as clean", () => {
    const [node] = decorateFileTree([{ type: "file", name: "x", path: "x" }], { x: "ignored" });
    expect(node.gitStatus).toBe("clean");
    expect(node.dirtyDescendants).toBe(false);
  });

  it("normalizes paths, empty input, open folders, status overrides, and dirty statuses", () => {
    expect(decorateFileTree()).toEqual([]);
    const [src, readme, win] = decorateFileTree([
      { type: "dir", name: "src", path: "./src", open: true, status: "modified", children: [] },
      { type: "file", name: "README.md" },
      { type: "dir", name: "win", path: ".\\win", children: [{ type: "file", name: "main.ts", path: ".\\win\\main.ts", status: "modified" }] },
    ], { src: "clean", "README.md": "added" });
    expect(src).toMatchObject({ id: "src", path: "src", children: undefined, expanded: true, gitStatus: "clean" });
    expect(readme).toMatchObject({ id: "README.md", path: "README.md", gitStatus: "added" });
    expect(win).toMatchObject({ id: "./win", path: "./win", dirtyDescendants: true });
    expect(win.children?.[0]).toMatchObject({ id: "./win/main.ts", path: "./win/main.ts", gitStatus: "modified" });
    for (const status of ["modified", "added", "untracked", "deleted", "renamed"]) {
      expect(isDirtyStatus(status)).toBe(true);
    }
    expect(isDirtyStatus("clean")).toBe(false);
    expect(isDirtyStatus("unknown")).toBe(false);
    expect(isDirtyStatus(undefined)).toBe(false);

    const [empty] = decorateFileTree([{ type: "other", name: "", path: "" }], {}, "", new Set([""]));
    expect(empty).toMatchObject({ id: "", path: "", kind: "file", selected: true, expanded: true });
    const [statusFromNode] = decorateFileTree([{ type: "file", name: "node-status", status: "renamed" }]);
    expect(statusFromNode.gitStatus).toBe("renamed");
    const [parent] = decorateFileTree([{ type: "dir", name: "parent", children: [{ type: "dir", name: "child", children: [{ type: "file", name: "leaf", status: "modified" }] }] }]);
    expect(parent.dirtyDescendants).toBe(true);
  });
});
