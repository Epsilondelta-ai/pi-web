import { describe, expect, it } from "vitest";
import { SETTINGS_FIELDS, parseSettingsPatch, parseWorkspaceSettings } from "./settings-schema";

describe("settings schema", () => {
  it("shares UI metadata for all editable settings", () => {
    expect(SETTINGS_FIELDS.map((field) => field.path)).toContain("terminal.imageWidthCells");
    expect(SETTINGS_FIELDS.find((field) => field.path === "transport")?.values).toContain("websocket-cached");
  });

  it("accepts valid workspace settings responses with unknown custom keys", () => {
    expect(parseWorkspaceSettings({
      global: { theme: "dark", customSetting: "keep" },
      project: { terminal: { showImages: true } },
      effective: { transport: "auto", terminal: { imageWidthCells: 80 } },
      paths: { global: "/home/me/.pi/agent/settings.json", project: "/repo/.pi/settings.json" },
    })).toMatchObject({
      global: { customSetting: "keep" },
      effective: { transport: "auto" },
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
      terminal: { imageWidthCells: 120, showImages: false },
    })).toMatchObject({ transport: "sse", terminal: { showImages: false } });

    expect(() => parseSettingsPatch({ doubleEscapeAction: "explode" })).toThrow("invalid settings patch");
  });
});
