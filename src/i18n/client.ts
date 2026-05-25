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
  const locale = storedLocale();
  if (locale) return locale;
  /* v8 ignore next -- navigator is always present in supported browsers/tests */
  return browserUiLocale(globalThis.navigator?.languages || []);
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
    element.textContent = uiMessage(locale, element.dataset.i18n as UiMessageKey);
  }
  for (const element of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder]")) {
    element.placeholder = uiMessage(locale, element.dataset.i18nPlaceholder as UiMessageKey);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", uiMessage(locale, element.dataset.i18nAriaLabel as UiMessageKey));
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    element.setAttribute("title", uiMessage(locale, element.dataset.i18nTitle as UiMessageKey));
  }
}

export function applyUiLocale(locale: UiLocale, root: ParentNode = document) {
  /* v8 ignore next -- callers pass normalized locales from typed metadata */
  const normalized = normalizeUiLocale(locale) || DEFAULT_UI_LOCALE;
  document.documentElement.lang = UI_LOCALES.find((item) => item.code === normalized)!.htmlLang;
  const selector = root.querySelector<HTMLSelectElement>("[data-ui-language]");
  if (selector) selector.value = normalized;
  applyText(root, normalized);
  window.dispatchEvent(new CustomEvent("pi-ui-locale-change", { detail: { locale: normalized } }));
}

export function setUiLocale(locale: UiLocale, root: ParentNode = document) {
  /* v8 ignore next -- callers pass normalized locales from typed metadata */
  const normalized = normalizeUiLocale(locale) || DEFAULT_UI_LOCALE;
  saveUiLocale(normalized);
  applyUiLocale(normalized, root);
}
