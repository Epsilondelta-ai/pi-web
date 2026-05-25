import { describe, expect, it, vi } from "vitest";
import { applyUiLocale, currentUiLocale, saveUiLocale, setUiLocale } from "./client";
import { UI_LOCALE_STORAGE_KEY, browserUiLocale, normalizeUiLocale } from "./locales";
import { UI_MESSAGES, uiMessage } from "./ui";

describe("ui locales", () => {
  it("normalizes exact, case-insensitive, and base language matches", () => {
    expect(normalizeUiLocale("pt-br")).toBe("pt-BR");
    expect(normalizeUiLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeUiLocale("de-DE")).toBe("de");
  });

  it("detects the first supported browser locale", () => {
    expect(browserUiLocale(["it-IT", "ja-JP", "en-US"])).toBe("ja");
    expect(browserUiLocale(["it-IT"])).toBe("en");
    expect(normalizeUiLocale(null)).toBeUndefined();
  });

  it("returns localized settings messages", () => {
    expect(uiMessage("zh-CN", "settingsTitle")).toBe("pi 设置");
    expect(uiMessage("ko", "settingsTitle")).toBe("pi 설정");
    expect(UI_MESSAGES.en.settingsTitle).toBe("pi settings");
  });

  it("updates static i18n text without clobbering dynamic settings status", () => {
    document.body.innerHTML = `
      <main>
        <strong data-i18n="settingsTitle">pi settings</strong>
        <small data-settings-status>saved</small>
        <small>effective: claude/sonnet</small>
      </main>
    `;

    applyUiLocale("ko", document);

    expect(document.querySelector("[data-i18n='settingsTitle']")?.textContent).toBe("pi 설정");
    expect(document.querySelector("[data-settings-status]")?.textContent).toBe("saved");
    expect(document.querySelector("main small:last-child")?.textContent).toBe("effective: claude/sonnet");
  });

  it("updates attributes, selector state, storage, and current locale", () => {
    document.body.innerHTML = `
      <main>
        <select data-ui-language><option value="en">English</option><option value="de">Deutsch</option></select>
        <input data-i18n-placeholder="pasteApiKey" />
        <button data-i18n-aria-label="closeSettings" data-i18n-title="closeSettings"></button>
      </main>
    `;

    setUiLocale("de", document);

    expect(localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe("de");
    expect(currentUiLocale()).toBe("de");
    expect(document.documentElement.lang).toBe("de");
    expect(document.querySelector("select")?.value).toBe("de");
    expect(document.querySelector("input")?.getAttribute("placeholder")).toBe("API-Key einfügen");
    expect(document.querySelector("button")?.getAttribute("aria-label")).toBe("Einstellungen schließen");
    expect(document.querySelector("button")?.getAttribute("title")).toBe("Einstellungen schließen");

    applyUiLocale("unsupported" as never, document);
    expect(document.documentElement.lang).toBe("en");
    setUiLocale("unsupported" as never, document);
    expect(localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe("en");
  });

  it("falls back when storage is unavailable", () => {
    const originalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => { throw new Error("blocked"); }),
        setItem: vi.fn(() => { throw new Error("blocked"); }),
      },
    });

    saveUiLocale("fr");
    expect(currentUiLocale()).toBe(browserUiLocale(navigator.languages));

    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  });

  it("falls back to default locale without navigator languages", () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: undefined });
    localStorage.removeItem(UI_LOCALE_STORAGE_KEY);
    expect(currentUiLocale()).toBe("en");
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  });

  it("falls back to English messages for missing localized keys", () => {
    const koMessages = UI_MESSAGES.ko as Record<string, string | undefined>;
    const previous = koMessages.save;
    delete koMessages.save;
    expect(uiMessage("ko", "save")).toBe("save");
    koMessages.save = previous;
  });
});
