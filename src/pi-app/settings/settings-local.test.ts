import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLocalSettingsState,
  deleteEmptyContainers,
  deletePath,
  localSettingsKey,
  mergeSettings,
  pruneLocalSettingsPatch,
  readLocalSettings,
  saveLocalSettingsPatch,
  writeLocalSettings,
} from "./settings-methods";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("browser-local settings", () => {
  it("keys global settings separately from project settings", () => {
    expect(localSettingsKey("global", "w1")).toBe("pi-web.localSettings.global");
    expect(localSettingsKey("project", "w1")).toBe("pi-web.localSettings.project:w1");
    expect(localSettingsKey("project", "")).toBe("pi-web.localSettings.global");
  });

  it("reads, writes, removes, and ignores invalid local settings", () => {
    writeLocalSettings("project", "w1", { readResponsesAloud: true });
    expect(readLocalSettings("project", "w1")).toEqual({ readResponsesAloud: true });
    writeLocalSettings("project", "w1", {});
    expect(localStorage.getItem("pi-web.localSettings.project:w1")).toBeNull();

    localStorage.setItem("pi-web.localSettings.global", "[");
    expect(readLocalSettings("global", "w1")).toEqual({});
    localStorage.setItem("pi-web.localSettings.global", "[]");
    expect(readLocalSettings("global", "w1")).toEqual({});

    const originalSetItem = localStorage.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => writeLocalSettings("global", "w1", { enableSkillCommands: false })).not.toThrow();
    Storage.prototype.setItem = originalSetItem;
  });

  it("deletes nested paths and empty containers", () => {
    expect(deleteEmptyContainers(null)).toBeNull();
    expect(deleteEmptyContainers([])).toEqual([]);
    const settings = { voice: { language: "ja-JP" }, speechInput: { language: "ja", nested: {} } };
    deletePath(settings, "voice.language");
    deletePath(settings, "missing.value");
    deleteEmptyContainers(settings);
    expect(settings).toEqual({ speechInput: { language: "ja" } });
  });

  it("merges local settings over server settings", () => {
    writeLocalSettings("global", "w1", { enableSkillCommands: false, voice: { language: "en-US" } });
    writeLocalSettings("project", "w1", { voice: { language: "ko-KR" }, speechInput: { language: "ko" } });
    expect(applyLocalSettingsState({ global: {}, project: {}, effective: { enableSkillCommands: true }, paths: {} }, "w1"))
      .toMatchObject({
        global: { enableSkillCommands: false, voice: { language: "en-US" } },
        project: { voice: { language: "ko-KR" }, speechInput: { language: "ko" } },
        effective: { enableSkillCommands: false, voice: { language: "ko-KR" }, speechInput: { language: "ko" } },
      });
    expect(applyLocalSettingsState(null, "w1")).toBeNull();
    expect(applyLocalSettingsState({ paths: {} }, "w2")).toEqual({
      paths: {},
      global: { enableSkillCommands: false, voice: { language: "en-US" } },
      project: {},
      effective: { enableSkillCommands: false, voice: { language: "en-US" } },
    });
    expect(mergeSettings({ a: { b: 1 } }, null, { a: { c: 2 } }, { d: [1] })).toEqual({ a: { b: 1, c: 2 }, d: [1] });
  });

  it("splits local settings from remote patches and persists removals", () => {
    const { localPatch, remotePatch } = pruneLocalSettingsPatch({
      defaultModel: "claude",
      voice: { language: "ja-JP" },
      speechInput: { language: "ja", useLocalWhisper: null },
      terminal: { showImages: false },
    });
    expect(localPatch).toEqual({
      voice: { language: "ja-JP" },
      speechInput: { language: "ja", useLocalWhisper: null },
      terminal: { showImages: false },
    });
    expect(remotePatch).toEqual({ defaultModel: "claude" });

    saveLocalSettingsPatch("project", "w1", { speechInput: { language: "ko", useLocalWhisper: true } });
    saveLocalSettingsPatch("project", "w1", { speechInput: { useLocalWhisper: null } });
    expect(readLocalSettings("project", "w1")).toEqual({ speechInput: { language: "ko" } });
    saveLocalSettingsPatch("project", "w1", { speechInput: { language: null } });
    expect(localStorage.getItem("pi-web.localSettings.project:w1")).toBeNull();
  });
});
