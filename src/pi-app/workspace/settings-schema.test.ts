import { describe, expect, it } from "vitest";
import { SETTINGS_FIELDS, parseSettingsPatch, parseWorkspaceSettings } from "./settings-schema";

describe("settings schema", () => {
  it("shows only settings relevant to pi-web", () => {
    const paths = SETTINGS_FIELDS.map((field) => field.path);

    expect(paths).toContain("defaultModel");
    expect(paths).toContain("compaction.enabled");
    expect(paths).toContain("enableSkillCommands");
    expect(paths).toContain("readResponsesAloud");
    expect(paths).toContain("voice.language");
    expect(paths).toContain("enableSpeechInput");
    expect(paths).toContain("speechInput.language");
    expect(paths).toContain("remoteNotifications.discord.enabled");
    expect(paths).toContain("remoteNotifications.discord.token");
    expect(paths).toContain("remoteNotifications.discord.channelId");
    expect(paths).toContain("remoteNotifications.telegram.enabled");
    expect(paths).toContain("remoteNotifications.telegram.token");
    expect(paths).toContain("remoteNotifications.telegram.chatId");
    expect(paths).not.toContain("voice.engine");
    expect(paths).not.toContain("theme");
    expect(paths).not.toContain("terminal.imageWidthCells");
    expect(paths).not.toContain("transport");
    expect(paths).not.toContain("doubleEscapeAction");
  });

  it("accepts valid workspace settings responses with unknown custom keys", () => {
    expect(parseWorkspaceSettings({
      global: { theme: "dark", customSetting: "keep" },
      project: { terminal: { showImages: true } },
      effective: {
        transport: "auto",
        readResponsesAloud: true,
        voice: { language: "ko-KR" },
        enableSpeechInput: true,
        speechInput: { language: "ko-KR", useLocalWhisper: true, whisperModel: "large-v3" },
        remoteNotifications: {
          discord: { enabled: true, token: "bot-token", channelId: "123" },
          telegram: { enabled: true, token: "telegram-token", chatId: "456" },
        },
        terminal: { imageWidthCells: 80 },
      },
      paths: { global: "/home/me/.pi/web/settings.json", project: "/repo/.pi/pi-web.json" },
    })).toMatchObject({
      global: { customSetting: "keep" },
      effective: {
        transport: "auto",
        readResponsesAloud: true,
        voice: { language: "ko-KR" },
        enableSpeechInput: true,
        speechInput: { language: "ko-KR", useLocalWhisper: true, whisperModel: "large-v3" },
        remoteNotifications: {
          discord: { enabled: true, token: "bot-token", channelId: "123" },
          telegram: { enabled: true, token: "telegram-token", chatId: "456" },
        },
      },
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
      voice: { language: "ja-JP" },
      enableSpeechInput: true,
      speechInput: { language: "ja-JP", useLocalWhisper: true, whisperModel: "large-v3-q5" },
      remoteNotifications: {
        discord: { enabled: true, token: "bot-token", channelId: "123" },
        telegram: { enabled: true, token: "telegram-token", chatId: "456" },
      },
      terminal: { imageWidthCells: 120, showImages: false },
    })).toMatchObject({
      transport: "sse",
      remoteNotifications: {
        discord: { enabled: true, channelId: "123" },
        telegram: { enabled: true, chatId: "456" },
      },
      terminal: { showImages: false },
    });

    expect(() => parseSettingsPatch({ speechInput: { whisperModel: "huge" } })).toThrow("invalid settings patch");
    expect(() => parseSettingsPatch({ doubleEscapeAction: "explode" })).toThrow("invalid settings patch");
  });
});
