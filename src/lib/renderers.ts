import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
});

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, index, options);
};

markdown.renderer.rules.fence = (tokens, index) => renderCodeBlock(tokens[index].content, languageFromInfo(tokens[index].info));
markdown.renderer.rules.code_block = (tokens, index) => renderCodeBlock(tokens[index].content);

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function languageFromInfo(info) {
  const language = String(info || "").trim().split(/\s+/)[0] || "";
  return language.replace(/[^\w-]/g, "");
}

function renderCodeBlock(code, language = "") {
  const classAttr = language ? ` class="language-${escapeHtml(language)}"` : "";
  return [
    '<div class="code-block">',
    '<button type="button" class="code-copy-btn" data-action="copy-code" aria-label="copy code" title="copy code">copy</button>',
    `<pre><code${classAttr}>${escapeHtml(code)}</code></pre>`,
    "</div>\n",
  ].join("");
}

export function renderMarkdownBody(text) {
  return markdown.render(String(text ?? "")).trim();
}

export function renderPiBody(text) {
  return restorePiInlineMarkup(renderMarkdownBody(text));
}

export function renderUserBody(text) {
  return renderMarkdownBody(text);
}

function restorePiInlineMarkup(html) {
  return html
    .replace(/&lt;tool&gt;([\s\S]*?)&lt;\/tool&gt;/g, '<span class="tool-ref">$1</span>')
    .replace(/&lt;code&gt;([\s\S]*?)&lt;\/code&gt;/g, '<code>$1</code>')
    .replace(/&lt;cursor&gt;&lt;\/cursor&gt;/g, '<span class="cursor"></span>');
}

export function renderBannerBody(text) {
  return escapeHtml(text)
    .replace(/&lt;a&gt;([\s\S]*?)&lt;\/a&gt;/g, '<span class="accent">$1</span>')
    .replace(/&lt;d&gt;([\s\S]*?)&lt;\/d&gt;/g, '<span class="dim">$1</span>')
    .replace(/&lt;t&gt;([\s\S]*?)&lt;\/t&gt;/g, '<span class="tool">$1</span>');
}

export function renderAnsiBody(text) {
  const tagMap = {
    a: "ansi-green",
    r: "ansi-red",
    y: "ansi-yellow",
    c: "ansi-cyan",
    d: "ansi-dim",
    t: "ansi-yellow",
    ad: "added",
    rm: "removed",
  };
  let html = escapeHtml(text);
  for (const [tag, className] of Object.entries(tagMap)) {
    const tagPattern = new RegExp(`&lt;${tag}&gt;([\\s\\S]*?)&lt;\\/${tag}&gt;`, "g");
    html = html.replace(tagPattern, `<span class="${className}">$1</span>`);
  }
  return html;
}


