import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceFile, deleteWorkspaceFile, renameWorkspaceFile } from "../lib/api";
import WorkspaceFileTree from "./WorkspaceFileTree";

vi.mock("../lib/api", () => ({
  createWorkspaceFile: vi.fn().mockResolvedValue({}),
  deleteWorkspaceFile: vi.fn().mockResolvedValue({}),
  renameWorkspaceFile: vi.fn().mockResolvedValue({}),
  uploadWorkspaceFile: vi.fn().mockResolvedValue({}),
}));

describe("WorkspaceFileTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it("renders files, status badges, expansion, and activation contract", async () => {
    const { host, root } = await renderTree();

    await act(async () => {
      root.render(<WorkspaceFileTree initialFiles={[]} />);
    });
    expect(host.textContent).toContain("file tree loads from backend");

    await updateTree();

    const folder = host.querySelector<HTMLButtonElement>(".tree-node.dir");
    expect(folder?.textContent).toContain("src");
    expect(folder?.querySelector("[aria-label='dirty']")?.textContent).toBe("•");
    expect(folder?.querySelector(".file-icon")?.getAttribute("data-icon-name")).toBe("folder-src");

    await act(async () => folder?.click());
    const file = [...host.querySelectorAll<HTMLButtonElement>(".tree-node.file")]
      .find((button) => button.dataset.filePath === "src/main.ts");
    expect(file?.dataset.action).toBe("open-file");
    expect(file?.querySelector(".file-icon")?.getAttribute("data-icon-name")).toBe("typescript");
    expect(file?.querySelector("[aria-label='modified']")?.textContent).toBe("M");

    const click = vi.fn();
    host.addEventListener("click", click);
    await act(async () => file?.click());
    expect(click).toHaveBeenCalled();

    await cleanup(root, host);
  });

  it("filters the tree with the all-file search", async () => {
    const { host, root } = await renderTree();
    await updateTree();

    const search = host.querySelector<HTMLInputElement>(".tree-search input");
    await act(async () => {
      setInputValue(search!, "new");
      search!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(host.querySelector("[data-file-path='src/new.ts']")).toBeTruthy();
    expect(host.querySelector("[data-file-path='src/main.ts']")).toBeFalsy();

    await cleanup(root, host);
  });

  it("creates files in the context menu target folder", async () => {
    const { host, root } = await renderTree();
    await updateTree();
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    vi.spyOn(window, "prompt").mockReturnValue("src/created.ts");
    const refresh = vi.fn();
    window.addEventListener("pi-workspace-tree:refresh", refresh);

    const folder = host.querySelector<HTMLButtonElement>(".tree-node.dir");
    await act(async () => {
      folder?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }));
    });
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "new file")?.click();
    });

    expect(createWorkspaceFile).toHaveBeenCalledWith("workspace-1", "src/created.ts", "file");
    expect(refresh).toHaveBeenCalled();
    await cleanup(root, host);
  });

  it("renames and deletes selected file targets from the action menu", async () => {
    const { host, root } = await renderTree();
    await updateTree();
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    vi.spyOn(window, "prompt").mockReturnValue("src/renamed.ts");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const folder = host.querySelector<HTMLButtonElement>(".tree-node.dir");
    await act(async () => folder?.click());
    const file = [...host.querySelectorAll<HTMLButtonElement>(".tree-node.file")]
      .find((button) => button.dataset.filePath === "src/main.ts");
    await act(async () => {
      file?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }));
    });
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "rename")?.click();
    });
    expect(renameWorkspaceFile).toHaveBeenCalledWith("workspace-1", "src/main.ts", "src/renamed.ts");

    await act(async () => {
      file?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }));
    });
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "delete")?.click();
    });
    expect(deleteWorkspaceFile).toHaveBeenCalledWith("workspace-1", "src/main.ts");
    await cleanup(root, host);
  });
});

async function renderTree() {
  const host = document.createElement("div");
  host.className = "tree-list";
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<WorkspaceFileTree initialFiles={[]} />);
  });
  return { host, root };
}

async function updateTree() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("pi-workspace-tree:update", {
      detail: {
        statusMap: { "src/main.ts": "modified", "src/new.ts": "untracked" },
        files: [{
          type: "dir",
          name: "src",
          path: "src",
          children: [
            { type: "file", name: "main.ts", path: "src/main.ts" },
            { type: "file", name: "new.ts", path: "src/new.ts" },
          ],
        }],
      },
    }));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(input, value);
}

async function cleanup(root, host) {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}
