import { escapeHtml } from "../../lib/renderers";

const EXTENSION_LANGUAGE = {
  astro: "astro",
  cjs: "javascript",
  css: "css",
  dockerfile: "dockerfile",
  go: "go",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  makefile: "makefile",
  md: "markdown",
  mjs: "javascript",
  sh: "shellscript",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
};

export function languageForFile(file) {
  if (file.mime === "application/json") return "json";
  if (file.mime === "image/svg+xml") return "xml";
  if (file.mime === "text/html") return "html";
  const name = (file.path || "").split("/").pop()?.toLowerCase() || "";
  if (["dockerfile", "makefile"].includes(name)) return EXTENSION_LANGUAGE[name];
  const extension = name.includes(".") ? name.split(".").pop() : "";
  return EXTENSION_LANGUAGE[extension] || "text";
}

export async function renderHighlightedCode(source, file) {
  languageForFile(file);
  return escapeHtml(source);
}
