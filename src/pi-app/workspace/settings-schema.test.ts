import { describe, expect, it } from "vitest";
import { SETTINGS_FIELDS, parseSettingsPatch, parseWorkspaceSettings } from "./settings-schema";

describe("settings schema", () => {
  it("shows only settings relevant to pi-web", () => {
    const paths = SETTINGS_FIELDS.map((field) => field.path);

    expect(paths).toContain("defaultModel");
    expect(paths).toContain("compaction.enabled");
    expect(paths).toContain("enableSkillCommands");
    expect(paths).toContain("readResponsesAloud");
    expect(paths).not.toContain("theme");
    expect(paths).not.toContain("terminal.imageWidthCells");
    expect(paths).not.toContain("transport");
    expect(paths).not.toContain("doubleEscapeAction");
  });

  it("accepts valid workspace settings responses with unknown custom keys", () => {
    expect(parseWorkspaceSettings({
      global: { theme: "dark", customSetting: "keep" },
      project: { terminal: { showImages: true } },
      effective: { transport: "auto", readResponsesAloud: true, terminal: { imageWidthCells: 80 } },
      paths: { global: "/home/me/.pi/agent/settings.json", project: "/repo/.pi/settings.json" },
    })).toMatchObject({
      global: { customSetting: "keep" },
      effective: { transport: "auto", readResponsesAloud: true },
    });
  });

  it("rejects invalid workspace settings responses", () => {
    expect(() => parseWorkspaceSettings({
      global: {},
      project: {},
      effective: { transport: "ftp" },
      paths: {},
    })).toThrow("invalid settings response");
    expect(() => parseWorkspaceSettings(null)).toThrow("value:");
  });

  it("accepts nullable form patches and rejects invalid enum values", () => {
    expect(parseSettingsPatch({
      defaultProvider: null,
      transport: "sse",
      readResponsesAloud: true,
      terminal: { imageWidthCells: 120, showImages: false },
    })).toMatchObject({ transport: "sse", terminal: { showImages: false } });

    expect(() => parseSettingsPatch({ doubleEscapeAction: "explode" })).toThrow("invalid settings patch");
  });
});
