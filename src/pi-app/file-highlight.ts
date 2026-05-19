import { escapeHtml } from "../renderers";

const EXTENSION_LANGUAGE = {
  astro: "markup",
  cjs: "javascript",
  css: "css",
  go: "go",
  html: "markup",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  sh: "shell",
  ts: "javascript",
  tsx: "javascript",
  yaml: "yaml",
  yml: "yaml",
};

const KEYWORDS = {
  css: [
    "align-items",
    "background",
    "border",
    "color",
    "display",
    "flex",
    "font",
    "grid",
    "height",
    "margin",
    "padding",
    "position",
    "width",
  ],
  go: [
    "break",
    "case",
    "chan",
    "const",
    "continue",
    "defer",
    "else",
    "fallthrough",
    "for",
    "func",
    "go",
    "if",
    "import",
    "interface",
    "map",
    "package",
    "range",
    "return",
    "select",
    "struct",
    "switch",
    "type",
    "var",
  ],
  javascript: [
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "let",
    "new",
    "return",
    "static",
    "switch",
    "throw",
    "try",
    "typeof",
    "var",
    "while",
    "yield",
  ],
  shell: [
    "case",
    "do",
    "done",
    "elif",
    "else",
    "esac",
    "fi",
    "for",
    "function",
    "if",
    "in",
    "then",
    "while",
  ],
};

const MARKUP_PATTERN = new RegExp(
  "<!--[\\s\\S]*?-->|<\\/?[\\w:-]+|\\b[\\w:-]+(?==)|" +
    "`(?:\\\\[\\s\\S]|[^`\\\\])*`|\"(?:\\\\.|[^\"\\\\])*\"|" +
    "'(?:\\\\.|[^'\\\\])*'|\\b\\d+(?:\\.\\d+)?\\b",
  "g",
);
const JSON_PATTERN = /"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|\b\d+(?:\.\d+)?\b/g;
const STRING_PATTERN = "`(?:\\\\[\\s\\S]|[^`\\\\])*`|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'";

export function languageForFile(file) {
  if (file.mime === "application/json") return "json";
  if (file.mime === "image/svg+xml" || file.mime === "text/html") return "markup";
  const name = (file.path || "").split("/").pop()?.toLowerCase() || "";
  if (["dockerfile", "makefile"].includes(name)) return "shell";
  const extension = name.includes(".") ? name.split(".").pop() : "";
  return EXTENSION_LANGUAGE[extension] || "text";
}

export function renderHighlightedCode(source, file) {
  const language = languageForFile(file);
  const pattern = tokenPattern(language);
  if (!pattern) return escapeHtml(source);
  let html = "";
  let cursor = 0;
  source.replace(pattern, (token, offset) => {
    html += escapeHtml(source.slice(cursor, offset));
    html += renderToken(token, language, source, offset + token.length);
    cursor = offset + token.length;
    return token;
  });
  return html + escapeHtml(source.slice(cursor));
}

function tokenPattern(language) {
  const keywords = KEYWORDS[language] || [];
  const keywordPattern = keywords.length ? `|\\b(?:${keywords.join("|")})\\b` : "";
  if (language === "markup") return MARKUP_PATTERN;
  if (language === "json") return JSON_PATTERN;
  return new RegExp(
    `/\\*[\\s\\S]*?\\*/|//[^\\n]*|#[^\\n]*|${STRING_PATTERN}` +
      `${keywordPattern}|\\b\\d+(?:\\.\\d+)?\\b`,
    "g",
  );
}

function renderToken(token, language, source, end) {
  const className = tokenClass(token, language, source, end);
  return className ? `<span class="${className}">${escapeHtml(token)}</span>` : escapeHtml(token);
}

function tokenClass(token, language, source, end) {
  if (/^(\/\*|\/\/|#|<!--)/.test(token)) return "syntax-comment";
  if (/^[`"']/.test(token)) return jsonStringClass(language, source, end);
  if (/^<\/?[\w:-]+/.test(token)) return "syntax-keyword";
  if (/^[\w:-]+$/.test(token) && source.slice(end).match(/^\s*=/)) return "syntax-property";
  if (/^\d/.test(token)) return "syntax-number";
  return "syntax-keyword";
}

function jsonStringClass(language, source, end) {
  return language === "json" && source.slice(end).match(/^\s*:/) ? "syntax-property" : "syntax-string";
}
