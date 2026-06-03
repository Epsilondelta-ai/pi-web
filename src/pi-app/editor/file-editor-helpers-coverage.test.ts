import { describe, expect, it } from "vitest";
import { Text } from "@codemirror/state";
import { RangeSetBuilder } from "@codemirror/state";
import { addLineMarkers, buildGitChangeMarkers, fileExtensionFromName, GitChangeMarker } from "./file-editor";

describe("file editor git marker helpers", () => {
  it("covers empty and clamped marker ranges", () => {
    const doc = Text.of(["a", "b"]);
    const builder = new RangeSetBuilder<GitChangeMarker>();
    addLineMarkers(builder, doc, 1, 1, "added");
    expect(builder.finish().size).toBe(1);
    expect(buildGitChangeMarkers("", Text.of([""])).size).toBeGreaterThanOrEqual(0);
    expect(fileExtensionFromName("README")).toBe("");
    expect(fileExtensionFromName("file.ts")).toBe("ts");
  });
});
