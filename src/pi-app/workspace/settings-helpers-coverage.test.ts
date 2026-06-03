import { describe, expect, it } from "vitest";
import {
  baseLanguageCode,
  browserVoiceLanguageLabel,
  customInputFor,
  describeEffective,
  languageOptionFromList,
  passwordEffectiveLabel,
  settingsValueChanged,
  speechLanguageLabel,
  speechLanguageOption,
  speechLanguageValue,
  valueAt,
  visibleSettingsFocusables,
} from "./settings-methods";

function languageInput() {
  const field = document.createElement("label");
  field.className = "settings-field";
  const input = document.createElement("input");
  input.dataset.setting = "voice.language";
  const custom = document.createElement("input");
  custom.dataset.customSetting = "voice.language";
  const list = document.createElement("datalist");
  const option = document.createElement("option");
  option.value = "English";
  option.dataset.languageValue = "en-US";
  list.append(option);
  Object.defineProperty(input, "list", { value: list, configurable: true });
  field.append(input, custom);
  return { input, option, field, custom };
}

describe("settings pure helper coverage", () => {
  it("covers language, visibility, and changed-value helper fallbacks", () => {
    const { input, option, field, custom } = languageInput();
    expect(valueAt({ a: { b: 1 } }, "a.b")).toBe(1);
    expect(valueAt(null, "a.b")).toBeUndefined();
    expect(baseLanguageCode(undefined)).toBe("");
    expect(baseLanguageCode("EN-us")).toBe("en");
    expect(languageOptionFromList(null, "English")).toBeNull();
    expect(languageOptionFromList(input, "")).toBeNull();
    expect(languageOptionFromList(input, undefined)).toBeNull();
    expect(languageOptionFromList(input, "en-US")).toBe(option);
    expect(languageOptionFromList(input, "English")).toBe(option);
    expect(languageOptionFromList(input, "missing")).toBeUndefined();
    expect(speechLanguageOption("")).toBeTruthy();
    expect(speechLanguageOption("한국어(Korean)")?.value).toBe("ko");
    expect(speechLanguageOption("zz")).toBeUndefined();
    expect(speechLanguageValue("", input)).toBe("system");
    expect(speechLanguageValue("English", input)).toBe("en-US");
    expect(speechLanguageValue("한국어(Korean)", input)).toBe("ko");
    expect(speechLanguageValue("custom", input)).toBe("custom");
    expect(speechLanguageLabel("", input)).toBe("System default");
    expect(speechLanguageLabel("en-US", input)).toBe("English");
    expect(speechLanguageLabel("Japanese", input)).toMatch(/Japanese|日本語/);
    expect(speechLanguageLabel("custom", input)).toBe("custom");
    expect(browserVoiceLanguageLabel("system")).toBe("System default");
    expect(browserVoiceLanguageLabel("fr-FR")).toMatch(/French|Français/);
    expect(browserVoiceLanguageLabel("xx-XX")).toBe("xx-XX");
    expect(describeEffective(undefined)).toBe("not set");
    expect(describeEffective(true)).toBe("on");
    expect(describeEffective(false)).toBe("off");
    expect(describeEffective(7)).toBe("7");
    expect(customInputFor(input)).toBe(custom);
    expect(customInputFor(document.createElement("input"))).toBeUndefined();

    input.getClientRects = (() => [{ width: 1 } as DOMRect]) as unknown as typeof input.getClientRects;
    expect(visibleSettingsFocusables(field)).toContain(input);
    field.hidden = true;
    expect(visibleSettingsFocusables(field)).toEqual([]);

    expect(settingsValueChanged({ a: 1 }, {}, "a", 2)).toBe(true);
    expect(settingsValueChanged({}, {}, "a", null)).toBe(false);
    expect(settingsValueChanged({}, { a: 1 }, "a", 1)).toBe(false);
    expect(settingsValueChanged({}, { a: 1 }, "a", 2)).toBe(true);
    expect(passwordEffectiveLabel({ type: "password" }, "secret")).toBe("set");
    expect(passwordEffectiveLabel({ type: "text" }, "value")).toBe("value");
  });
});
