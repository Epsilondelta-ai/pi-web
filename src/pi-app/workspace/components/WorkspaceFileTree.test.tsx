import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceFile, deleteWorkspaceFile, renameWorkspaceFile, searchWorkspaceFiles, uploadWorkspaceFile } from "../../../shared/api/api";
import WorkspaceFileTree, { clearUploadInput, renderTreeContent, StatusBadge, treeRenderState } from "./WorkspaceFileTree";

vi.mock("react-arborist", () => ({
  Tree: ({ data = [], children, searchTerm = "", searchMatch, onToggle }: any) => {
    const renderNode = (item: any, depth = 0): React.ReactNode => {
      const childNodes = item.children || [];
      const childMatches = childNodes.map((child: any) => renderNode(child, depth + 1)).filter(Boolean);
      const matches = !searchTerm || searchMatch?.({ data: item }, searchTerm) || childMatches.length > 0;
      if (!matches) return null;
      const node = {
        data: item,
        isOpen: item.expanded,
        isSelected: item.selected,
        toggle: () => onToggle?.(item.id),
        select: () => undefined,
      };
      return <React.Fragment key={item.id}>{children({ node, style: { paddingLeft: depth * 8 }, dragHandle: null })}{childMatches}</React.Fragment>;
    };
    return <div role="tree">{data.map((item: any) => renderNode(item))}</div>;
  },
}));

vi.mock("../../../shared/api/api", () => ({
  createWorkspaceFile: vi.fn().mockResolvedValue({}),
  deleteWorkspaceFile: vi.fn().mockResolvedValue({}),
  renameWorkspaceFile: vi.fn().mockResolvedValue({}),
  searchWorkspaceFiles: vi.fn().mockResolvedValue({ matches: [] }),
  uploadWorkspaceFile: vi.fn().mockResolvedValue({}),
}));

describe("WorkspaceFileTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("covers status badge labels and upload input clearing directly", () => {
    expect(treeRenderState(0, 0)).toBe("loading");
    expect(treeRenderState(1, 0)).toBe("empty");
    expect(treeRenderState(1, 1)).toBe("tree");
    const loadingContent = renderTreeContent("loading", null) as React.ReactElement<any>;
    const treeContent = renderTreeContent("tree", <span />) as React.ReactElement<any>;
    const emptyContent = renderTreeContent("empty", null) as React.ReactElement<any>;
    expect(loadingContent.props.className).toBe("tree-empty");
    expect(treeContent.type).toBe("span");
    expect(emptyContent.props.children).toContain("검색");
    expect(() => clearUploadInput(null)).not.toThrow();
    const input = document.createElement("input");
    input.value = "x";
    clearUploadInput(input);
    expect(input.value).toBe("");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<><StatusBadge status="clean" /><StatusBadge status="strange" /></>));
    expect(host.querySelector("[aria-label='strange']")?.textContent).toBe("•");
    act(() => root.unmount());
    host.remove();
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
    await act(async () => folder?.click());
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

  it("filters the tree with file contents from backend search", async () => {
    vi.useFakeTimers();
    vi.mocked(searchWorkspaceFiles).mockResolvedValueOnce({ matches: ["src/main.ts"] });
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    const { host, root } = await renderTree();
    await updateTree();

    const search = host.querySelector<HTMLInputElement>(".tree-search input");
    await act(async () => {
      setInputValue(search!, "answer");
      search!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(searchWorkspaceFiles).toHaveBeenCalledWith("workspace-1", "answer");
    expect(host.querySelector("[data-file-path='src/main.ts']")).toBeTruthy();
    expect(host.querySelector("[data-file-path='src/new.ts']")).toBeFalsy();

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

  it("handles root menu, cancelled actions, failed search, and empty search results", async () => {
    vi.useFakeTimers();
    vi.mocked(searchWorkspaceFiles).mockRejectedValueOnce(new Error("search failed"));
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    const { host, root } = await renderTree();
    await updateTree();

    await act(async () => {
      window.dispatchEvent(new CustomEvent("pi-workspace-tree:root-menu", { detail: { x: 0, y: 0 } }));
    });
    expect(host.querySelector(".tree-action-menu")).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(host.querySelector(".tree-action-menu")).toBeFalsy();

    const search = host.querySelector<HTMLInputElement>(".tree-search input")!;
    await act(async () => {
      setInputValue(search, "missing");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(searchWorkspaceFiles).toHaveBeenCalledWith("workspace-1", "missing");
    await act(async () => {
      setInputValue(search, "");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("src");

    await cleanup(root, host);
  });

  it("uploads files and retries overwrite after already exists errors", async () => {
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    vi.mocked(uploadWorkspaceFile).mockRejectedValueOnce(new Error("already exists")).mockResolvedValue({});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { host, root } = await renderTree();
    await updateTree();

    const folder = host.querySelector<HTMLButtonElement>(".tree-node.dir");
    await act(async () => {
      folder?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }));
    });
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "upload here")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("input[type='file']")!;
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    const files = { 0: file, length: 1, item: () => file, [Symbol.iterator]: function* () { yield file; } };
    Object.defineProperty(input, "files", { configurable: true, value: files });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await Promise.resolve();
    });

    expect(uploadWorkspaceFile).toHaveBeenNthCalledWith(1, "workspace-1", "src/note.txt", "aGVsbG8=", false);
    expect(uploadWorkspaceFile).toHaveBeenNthCalledWith(2, "workspace-1", "src/note.txt", "aGVsbG8=", true);
    await cleanup(root, host);
  });

  it("creates folders, clamps menus, ignores missing workspaces, and reports action errors", async () => {
    const { host, root } = await renderTree();
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(window, "prompt").mockReturnValueOnce("docs").mockReturnValueOnce(null).mockReturnValueOnce("src/same.ts");
    vi.mocked(createWorkspaceFile).mockRejectedValueOnce(new Error("create failed"));

    await act(async () => {
      host.querySelector("[data-testid='workspace-file-tree']")?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 9999, clientY: -10 }),
      );
    });
    const menu = host.querySelector<HTMLElement>(".tree-action-menu")!;
    expect(Number(menu.style.left.replace("px", ""))).toBeLessThanOrEqual(window.innerWidth);
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "new folder")?.click();
    });
    expect(createWorkspaceFile).not.toHaveBeenCalled();

    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    await act(async () => {
      window.dispatchEvent(new CustomEvent("pi-workspace-tree:root-menu", { detail: {} }));
    });
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "new folder")?.click();
    });
    expect(alert).toHaveBeenCalledWith("create failed");

    await updateTree();
    const folder = host.querySelector<HTMLButtonElement>(".tree-node.dir");
    await act(async () => folder?.click());
    const file = [...host.querySelectorAll<HTMLButtonElement>(".tree-node.file")]
      .find((button) => button.dataset.filePath === "src/main.ts")!;
    await act(async () => file.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "rename")?.click();
    });
    expect(renameWorkspaceFile).not.toHaveBeenCalled();
    await cleanup(root, host);
  });

  it("covers resize observer, keyboard rows, badges, file-parent uploads, and upload failures", async () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    globalThis.ResizeObserver = vi.fn(function ResizeObserver(callback) {
      this.observe = observe;
      this.disconnect = disconnect;
      callback();
    }) as any;
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const { host, root } = await renderTree();
    Object.defineProperty(host.querySelector(".tree-arborist-body"), "getBoundingClientRect", {
      configurable: true,
      value: () => ({ height: 240 }),
    });
    await updateTree({ statusMap: { "src/main.ts": "deleted", "src/new.ts": "renamed" } });
    expect(observe).toHaveBeenCalled();

    const file = [...host.querySelectorAll<HTMLButtonElement>(".tree-node.file")]
      .find((button) => button.dataset.filePath === "src/main.ts")!;
    expect(file.querySelector("[aria-label='deleted']")?.textContent).toBe("D");
    await act(async () => file.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    await act(async () => file.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    await act(async () => file.querySelector<HTMLButtonElement>(".tree-row-menu")!.click());
    expect(host.querySelector(".tree-action-menu")).toBeTruthy();

    vi.mocked(uploadWorkspaceFile).mockRejectedValueOnce("plain failure");
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "upload here")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("input[type='file']")!;
    const upload = new File(["x"], "leaf.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { configurable: true, value: { 0: upload, length: 1, item: () => upload, [Symbol.iterator]: function* () { yield upload; } } });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(uploadWorkspaceFile).toHaveBeenCalledWith("workspace-1", "src/leaf.txt", "eA==", false);
    expect(window.alert).toHaveBeenCalledWith("plain failure");

    await cleanup(root, host);
    delete globalThis.ResizeObserver;
  });

  it("covers remaining row, action cancellation, root upload, and reader error branches", async () => {
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(false);
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const { host, root } = await renderTree();
    await updateTree({
      statusMap: {},
      files: [{ type: "file", name: "README.md", path: "README.md" }],
    });
    const file = host.querySelector<HTMLButtonElement>(".tree-node.file")!;
    expect(file.querySelector(".tree-status-badge")).toBeNull();
    const menuButton = file.querySelector<HTMLButtonElement>(".tree-row-menu")!;
    await act(async () => {
      const clickFromMenu = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(clickFromMenu, "target", { value: menuButton });
      file.dispatchEvent(clickFromMenu);
    });
    await act(async () => menuButton.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    await act(async () => file.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " })));
    await act(async () => file.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "new file")?.click();
    });
    expect(createWorkspaceFile).not.toHaveBeenCalled();

    await act(async () => file.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "delete")?.click();
    });
    expect(deleteWorkspaceFile).not.toHaveBeenCalled();

    vi.mocked(uploadWorkspaceFile).mockRejectedValueOnce(new Error("already exists"));
    await act(async () => file.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "upload here")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("input[type='file']")!;
    const upload = new File(["x"], "root.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { configurable: true, value: { 0: upload, length: 1, item: () => upload, [Symbol.iterator]: function* () { yield upload; } } });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(uploadWorkspaceFile).toHaveBeenCalledWith("workspace-1", "root.txt", "eA==", false);

    const NativeFileReader = globalThis.FileReader;
    globalThis.FileReader = class {
      error = new Error("reader failed");
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() { this.onerror?.(); }
    } as any;
    await act(async () => file.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "upload here")?.click();
    });
    Object.defineProperty(input, "files", { configurable: true, value: { 0: upload, length: 1, item: () => upload, [Symbol.iterator]: function* () { yield upload; } } });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.alert).toHaveBeenCalledWith("reader failed");

    await act(async () => file.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "upload here")?.click();
    });
    Object.defineProperty(input, "files", { configurable: true, value: null });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    Object.defineProperty(input, "files", { configurable: true, value: { length: 0, item: () => null, [Symbol.iterator]: function* () {} } });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    globalThis.FileReader = NativeFileReader;
    await cleanup(root, host);
  });

  it("covers update defaults, folder success, selected aria, multi-upload, and reader fallbacks", async () => {
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    vi.spyOn(window, "prompt").mockReturnValue("src/new-folder");
    const { host, root } = await renderTree();
    await act(async () => window.dispatchEvent(new Event("pi-workspace-tree:update")));
    expect(host.textContent).toContain("file tree loads from backend");
    await updateTree({ selectedPath: "src/main.ts" });
    const selected = host.querySelector<HTMLElement>("[data-file-path='src/main.ts']")!;
    expect(selected.getAttribute("aria-current")).toBe("true");
    const folder = host.querySelector<HTMLButtonElement>(".tree-node.dir")!;
    await act(async () => folder.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "new folder")?.click();
    });
    expect(createWorkspaceFile).toHaveBeenCalledWith("workspace-1", "src/new-folder", "dir");

    await act(async () => folder.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "upload here")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("input[type='file']")!;
    const one = new File(["one"], "one.txt", { type: "text/plain" });
    const two = new File(["two"], "two.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { configurable: true, value: { 0: one, 1: two, length: 2, item: (index: number) => [one, two][index], [Symbol.iterator]: function* () { yield one; yield two; } } });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(uploadWorkspaceFile).toHaveBeenCalledWith("workspace-1", "src/one.txt", "b25l", false);
    expect(uploadWorkspaceFile).toHaveBeenCalledWith("workspace-1", "src/two.txt", "dHdv", false);

    const NativeFileReader = globalThis.FileReader;
    globalThis.FileReader = class {
      error = null;
      result = "";
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() { this.onload?.(); }
    } as any;
    await act(async () => folder.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "upload here")?.click();
    });
    Object.defineProperty(input, "files", { configurable: true, value: { 0: one, length: 1, item: () => one, [Symbol.iterator]: function* () { yield one; } } });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(uploadWorkspaceFile).toHaveBeenCalledWith("workspace-1", "src/one.txt", "", false);

    globalThis.FileReader = class {
      error = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() { this.onerror?.(); }
    } as any;
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    await act(async () => folder.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".tree-action-menu button")]
        .find((button) => button.textContent === "upload here")?.click();
    });
    Object.defineProperty(input, "files", { configurable: true, value: { 0: one, length: 1, item: () => one, [Symbol.iterator]: function* () { yield one; } } });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.alert).toHaveBeenCalledWith("file read failed");
    globalThis.FileReader = NativeFileReader;
    await cleanup(root, host);
  });

  it("covers content search result and cleanup fallback branches", async () => {
    vi.useFakeTimers();
    let rejectSearch: (value: unknown) => void = () => undefined;
    vi.mocked(searchWorkspaceFiles)
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectSearch = reject; }) as never)
      .mockResolvedValueOnce({});
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    const { host, root } = await renderTree();
    await updateTree();
    const search = host.querySelector<HTMLInputElement>(".tree-search input")!;
    await act(async () => {
      setInputValue(search, "pending");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTime(250));
    await act(async () => {
      setInputValue(search, "next");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTime(250));
    await act(async () => {
      rejectSearch(new Error("cancelled search failure"));
      await Promise.resolve();
    });
    expect(searchWorkspaceFiles).toHaveBeenCalledWith("workspace-1", "next");
    await act(async () => {
      rejectSearch(new Error("cancelled search failure again"));
      await Promise.resolve();
      await Promise.resolve();
    });
    await cleanup(root, host);
  });

  it("covers root-menu event default detail branch", async () => {
    const { host, root } = await renderTree();
    await act(async () => window.dispatchEvent(new Event("pi-workspace-tree:root-menu")));
    expect(host.querySelector(".tree-action-menu")).toBeTruthy();
    await cleanup(root, host);
  });

  it("covers context default setter and row menu click guard", async () => {
    const reactModule = await import("react");
    let defaultContext: any;
    const actualCreateContext = reactModule.default.createContext;
    const createContext = vi.spyOn(reactModule.default, "createContext");
    createContext.mockImplementationOnce((value: any) => {
      defaultContext = value;
      return actualCreateContext(value);
    });
    vi.resetModules();
    await import("./WorkspaceFileTree");
    defaultContext?.setMenu?.({ x: 1, y: 2, path: "", kind: "root" });
    createContext.mockRestore();

    const { host, root } = await renderTree();
    await updateTree();
    const row = host.querySelector<HTMLElement>(".tree-node.dir")!;
    await act(async () => row.querySelector<HTMLButtonElement>(".tree-row-menu")!.click());
    expect(host.querySelector(".tree-action-menu")).toBeTruthy();
    await act(async () => window.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const fakeMenuTarget = document.createElement("span");
    fakeMenuTarget.className = "tree-row-menu";
    row.append(fakeMenuTarget);
    await act(async () => fakeMenuTarget.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(host.querySelector(".tree-action-menu")).toBeFalsy();
    await cleanup(root, host);
  }, 15000);

  it("covers search cancellation, empty filtered tree, upload guard, and unknown status badge", async () => {
    vi.useFakeTimers();
    const app = document.createElement("pi-app");
    app.dataset.activeWorkspaceId = "workspace-1";
    document.body.append(app);
    let resolveSearch: (value: unknown) => void = () => undefined;
    vi.mocked(searchWorkspaceFiles).mockReturnValueOnce(new Promise((resolve) => { resolveSearch = resolve; }) as never);
    const { host, root } = await renderTree();
    await act(async () => {
      window.dispatchEvent(new CustomEvent("pi-workspace-tree:update", {
        detail: { statusMap: { "src/odd.bin": "strange" }, files: [{ type: "file", name: "odd.bin", path: "src/odd.bin" }] },
      }));
    });
    expect(host.textContent).toContain("odd.bin");
    const search = host.querySelector<HTMLInputElement>(".tree-search input")!;
    await act(async () => {
      setInputValue(search, "nomatch");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector("[data-file-path='src/odd.bin']")).toBeFalsy();
    await act(async () => {
      vi.advanceTimersByTime(250);
      root.unmount();
      resolveSearch({ matches: ["src/odd.bin"] });
      await Promise.resolve();
    });
    host.remove();

    const second = await renderTree();
    await updateTree();
    const input = second.host.querySelector<HTMLInputElement>("input[type='file']")!;
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(uploadWorkspaceFile).not.toHaveBeenCalled();
    await cleanup(second.root, second.host);
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

async function updateTree(overrides: any = {}) {
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
        ...overrides,
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
