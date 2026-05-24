import {
  DEFAULT_UI_LOCALE,
  UI_LOCALE_STORAGE_KEY,
  UI_LOCALES,
  browserUiLocale,
  normalizeUiLocale,
  type UiLocale,
} from "./locales";
import { uiMessage, type UiMessageKey } from "./ui";

function storedLocale(): UiLocale | undefined {
  try {
    return normalizeUiLocale(globalThis.localStorage?.getItem(UI_LOCALE_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function currentUiLocale(): UiLocale {
  return storedLocale() || browserUiLocale(globalThis.navigator?.languages || []) || DEFAULT_UI_LOCALE;
}

export function saveUiLocale(locale: UiLocale) {
  try {
    globalThis.localStorage?.setItem(UI_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures; UI still updates for this session.
  }
}

function applyText(root: ParentNode, locale: UiLocale) {
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n as UiMessageKey | undefined;
    if (key) element.textContent = uiMessage(locale, key);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const key = element.dataset.i18nPlaceholder as UiMessageKey | undefined;
    if (key && "placeholder" in element) (element as HTMLInputElement).placeholder = uiMessage(locale, key);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) {
    const key = element.dataset.i18nAriaLabel as UiMessageKey | undefined;
    if (key) element.setAttribute("aria-label", uiMessage(locale, key));
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const key = element.dataset.i18nTitle as UiMessageKey | undefined;
    if (key) element.setAttribute("title", uiMessage(locale, key));
  }
}

export function applyUiLocale(locale: UiLocale, root: ParentNode = document) {
  const normalized = normalizeUiLocale(locale) || DEFAULT_UI_LOCALE;
  document.documentElement.lang = UI_LOCALES.find((item) => item.code === normalized)?.htmlLang || normalized;
  const selector = root.querySelector<HTMLSelectElement>("[data-ui-language]");
  if (selector) selector.value = normalized;
  applyText(root, normalized);
  window.dispatchEvent(new CustomEvent("pi-ui-locale-change", { detail: { locale: normalized } }));
}

export function setUiLocale(locale: UiLocale, root: ParentNode = document) {
  const normalized = normalizeUiLocale(locale) || DEFAULT_UI_LOCALE;
  saveUiLocale(normalized);
  applyUiLocale(normalized, root);
}
