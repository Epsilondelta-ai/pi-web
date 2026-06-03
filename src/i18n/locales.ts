export const UI_LOCALES = [
  { code: "en", label: "English", htmlLang: "en" },
  { code: "ko", label: "한국어", htmlLang: "ko" },
  { code: "zh-CN", label: "简体中文", htmlLang: "zh-CN" },
  { code: "ja", label: "日本語", htmlLang: "ja" },
  { code: "es", label: "Español", htmlLang: "es" },
  { code: "pt-BR", label: "Português (BR)", htmlLang: "pt-BR" },
  { code: "fr", label: "Français", htmlLang: "fr" },
  { code: "ru", label: "Русский", htmlLang: "ru" },
  { code: "de", label: "Deutsch", htmlLang: "de" },
] as const;

export type UiLocale = (typeof UI_LOCALES)[number]["code"];

export const DEFAULT_UI_LOCALE: UiLocale = "en";
export const UI_LOCALE_STORAGE_KEY = "pi-web.uiLocale";

const localeCodes = new Set<string>(UI_LOCALES.map((locale) => locale.code));
const baseLocaleCodes = new Map<string, UiLocale>();
for (const locale of UI_LOCALES) baseLocaleCodes.set(locale.code.split("-")[0].toLowerCase(), locale.code);

function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && localeCodes.has(value);
}

export function normalizeUiLocale(value: unknown): UiLocale | undefined {
  if (isUiLocale(value)) return value;
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  const exact = UI_LOCALES.find((locale) => locale.code.toLowerCase() === lower)?.code;
  if (exact) return exact;
  return baseLocaleCodes.get(lower.split("-")[0]);
}

export function browserUiLocale(languages: readonly string[] = []): UiLocale {
  for (const language of languages) {
    const locale = normalizeUiLocale(language);
    if (locale) return locale;
  }
  return DEFAULT_UI_LOCALE;
}
