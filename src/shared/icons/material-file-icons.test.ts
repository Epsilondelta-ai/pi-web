import { describe, expect, it } from "vitest";
import { resolveMaterialFileIcon } from "./material-file-icons";

describe("resolveMaterialFileIcon", () => {
  it("uses Material Icon Theme mappings for folders, filenames, and extensions", () => {
    expect(resolveMaterialFileIcon({ kind: "dir", name: "src" }).name).toBe("folder-src");
    expect(resolveMaterialFileIcon({ kind: "dir", name: "src", open: true }).name).toBe("folder-src-open");
    expect(resolveMaterialFileIcon({ kind: "dir", name: "unknown-folder" }).name).toBe("folder");
    expect(resolveMaterialFileIcon({ kind: "dir", name: "unknown-folder", open: true }).name).toBe("folder-open");
    expect(resolveMaterialFileIcon({ kind: "file", name: "README.md" }).name).toBe("readme");
    expect(resolveMaterialFileIcon({ kind: "file", name: "main.ts" }).name).toBe("typescript");
    expect(resolveMaterialFileIcon({ kind: "file", name: "unknown" }).name).toBe("file");
    expect(resolveMaterialFileIcon({ kind: "file", name: "main.ts" }).url).not.toBe(
      resolveMaterialFileIcon({ kind: "file", name: "unknown" }).url,
    );
    expect(resolveMaterialFileIcon({ kind: "dir", name: "src" }).url).not.toBe(
      resolveMaterialFileIcon({ kind: "dir", name: "unknown-folder" }).url,
    );
    expect(resolveMaterialFileIcon({ kind: "dir", name: "unknown-folder" }).url).toMatch(/^(data:image\/svg\+xml|\/)/);
  });

  it("resolves compound extensions, path-only names, and missing icon assets", () => {
    expect(resolveMaterialFileIcon({ kind: "file", name: "types.d.ts" }).name).toBe("typescript-def");
    expect(resolveMaterialFileIcon({ kind: "file", name: "", path: "src/main.ts" }).name).toBe("typescript");
    expect(resolveMaterialFileIcon({ kind: "file", name: "archive.unknown" }).name).toBe("file");
    expect(resolveMaterialFileIcon({ kind: "file", name: "" }).name).toBe("file");
    expect(resolveMaterialFileIcon({ kind: "file", name: "app.component.ts" })).toEqual({
      name: "angular-component",
      url: resolveMaterialFileIcon({ kind: "file", name: "unknown" }).url,
    });
  });
});
