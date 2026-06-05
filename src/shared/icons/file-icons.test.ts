import { describe, expect, it } from "vitest";
import { resolveFileIcon } from "./file-icons";

describe("resolveFileIcon", () => {
  it("uses local folder, filename, and extension mappings", () => {
    expect(resolveFileIcon({ kind: "dir", name: "src" }).name).toBe("folder-src");
    expect(resolveFileIcon({ kind: "dir", name: "src", open: true }).name).toBe("folder-src-open");
    expect(resolveFileIcon({ kind: "dir", name: "unknown-folder" }).name).toBe("folder");
    expect(resolveFileIcon({ kind: "dir", name: "unknown-folder", open: true }).name).toBe("folder-open");
    expect(resolveFileIcon({ kind: "file", name: "README.md" }).name).toBe("readme");
    expect(resolveFileIcon({ kind: "file", name: "main.ts" }).name).toBe("typescript");
    expect(resolveFileIcon({ kind: "file", name: "unknown" }).name).toBe("file");
    expect(resolveFileIcon({ kind: "file", name: "main.ts" }).url).not.toBe(
      resolveFileIcon({ kind: "file", name: "unknown" }).url,
    );
    expect(resolveFileIcon({ kind: "dir", name: "src" }).url).not.toBe(
      resolveFileIcon({ kind: "dir", name: "unknown-folder" }).url,
    );
    expect(resolveFileIcon({ kind: "dir", name: "unknown-folder" }).url).toMatch(/^data:image\/svg\+xml/);
  });

  it("resolves compound extensions, path-only names, and fallback icons", () => {
    expect(resolveFileIcon({ kind: "file", name: "types.d.ts" }).name).toBe("typescript-def");
    expect(resolveFileIcon({ kind: "file", name: "", path: "src/main.ts" }).name).toBe("typescript");
    expect(resolveFileIcon({ kind: "file", name: "archive.unknown" }).name).toBe("file");
    expect(resolveFileIcon({ kind: "file", name: "" }).name).toBe("file");
    expect(resolveFileIcon({ kind: "file", name: "app.component.ts" })).toEqual({
      name: "typescript",
      url: resolveFileIcon({ kind: "file", name: "main.ts" }).url,
    });
  });
});
