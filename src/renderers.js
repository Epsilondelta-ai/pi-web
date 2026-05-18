export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPiBody(text) {
  return escapeHtml(text)
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
  for (const [tag, cls] of Object.entries(tagMap)) {
    html = html.replace(new RegExp(`&lt;${tag}&gt;([\\s\\S]*?)&lt;\\/${tag}&gt;`, "g"), `<span class="${cls}">$1</span>`);
  }
  return html;
}

export function qrCells(value, size = 21) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = (h ^ value.charCodeAt(i)) * 16777619;
  const cells = [];
  let s = Math.abs(h);
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      s = (s * 9301 + 49297) % 233280;
      row.push(s % 2 === 0 ? 1 : 0);
    }
    cells.push(row);
  }
  const stamp = (r, c) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = y === 0 || y === 6 || x === 0 || x === 6;
        const center = y >= 2 && y <= 4 && x >= 2 && x <= 4;
        cells[r + y][c + x] = edge || center ? 1 : 0;
      }
    }
  };
  stamp(0, 0);
  stamp(0, size - 7);
  stamp(size - 7, 0);
  return cells;
}

export function qrHtml(value) {
  const cells = qrCells(value);
  return `<div class="qr-grid" style="grid-template-columns:repeat(${cells.length}, 1fr)">${cells
    .flatMap((row) => row.map((cell) => `<div class="${cell ? "qr-on" : "qr-off"}"></div>`))
    .join("")}</div>`;
}
