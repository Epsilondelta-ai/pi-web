import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import WorkspaceFileTree from "./WorkspaceFileTree";

describe("WorkspaceFileTree", () => {
  it("renders files, status badges, expansion, and activation contract", async () => {
    const host = document.createElement("div");
    host.className = "tree-list";
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<WorkspaceFileTree initialFiles={[]} />);
    });
    expect(host.textContent).toContain("file tree loads from backend");

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

    const folder = host.querySelector<HTMLButtonElement>(".tree-node.dir");
    expect(folder?.textContent).toContain("src");
    expect(folder?.querySelector("[aria-label='dirty']")?.textContent).toBe("•");

    await act(async () => folder?.click());
    const file = [...host.querySelectorAll<HTMLButtonElement>(".tree-node.file")]
      .find((button) => button.dataset.filePath === "src/main.ts");
    expect(file?.dataset.action).toBe("open-file");
    expect(file?.querySelector("[aria-label='modified']")?.textContent).toBe("M");

    const click = vi.fn();
    host.addEventListener("click", click);
    file?.click();
    expect(click).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
