import { describe, expect, it } from "vitest";
import { browserUiLocale, normalizeUiLocale } from "./locales";
import { UI_MESSAGES, uiMessage } from "./ui";

describe("ui locales", () => {
  it("normalizes exact, case-insensitive, and base language matches", () => {
    expect(normalizeUiLocale("pt-br")).toBe("pt-BR");
    expect(normalizeUiLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeUiLocale("de-DE")).toBe("de");
  });

  it("detects the first supported browser locale", () => {
    expect(browserUiLocale(["it-IT", "ja-JP", "en-US"])).toBe("ja");
  });

  it("returns localized settings messages", () => {
    expect(uiMessage("zh-CN", "settingsTitle")).toBe("pi 设置");
    expect(uiMessage("ko", "settingsTitle")).toBe("pi 설정");
    expect(UI_MESSAGES.en.settingsTitle).toBe("pi settings");
  });
});
