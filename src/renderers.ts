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

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPiBody(text) {
  return restorePiInlineMarkup(markdown.render(String(text ?? ""))).trim();
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

export function renderTree(nodes) {
  return nodes.map((node) => renderTreeNode(node)).join("");
}

function renderTreeNode(node) {
  const open = false;
  const action = node.type === "dir" ? "toggle-tree-node" : "open-file";
  const expanded = node.type === "dir" ? ` aria-expanded="${open}"` : "";
  const className = ["tree-node", node.type, node.status || ""].filter(Boolean).join(" ");
  const padding = `padding-left:calc(var(--space-3) + ${node.depth * 14}px)`;
  const glyph = node.type === "dir" ? (open ? "▾" : "▸") : "·";
  const filePath = escapeHtml(node.path || node.name);
  const children = renderTreeChildren(node, open);
  return [
    `<div class="tree-branch"><button type="button" class="${className}"`,
    ` data-action="${action}" data-file-path="${filePath}" style="${padding}"${expanded}>`,
    `<span class="glyph">${glyph}</span><span class="name">${escapeHtml(node.name)}</span></button>`,
    `${children}</div>`,
  ].join("");
}

function renderTreeChildren(node, open) {
  if (!node.children) return "";
  return `<div data-tree-children${open ? "" : " hidden"}>${renderTree(node.children)}</div>`;
}

