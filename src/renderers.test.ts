// @ts-nocheck
import { describe, expect, it } from "vitest";
import { renderBannerBody, renderPiBody, renderTree } from "./renderers";

describe("safe inline markup rendering", () => {
  it("escapes untrusted pi message html before restoring allowed tokens", () => {
    const html = renderPiBody('<img src=x onerror="alert(1)"><tool>bash</tool><code>x</code><cursor></cursor>');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('<span class="tool-ref">bash</span>');
    expect(html).toContain("<code>x</code>");
    expect(html).not.toContain("<img");
  });

  it("keeps newlines for CSS pre-wrap rendering", () => {
    const html = renderPiBody("first\nsecond");
    expect(html).toBe("first\nsecond");
  });

  it("escapes untrusted banner html before restoring allowed tokens", () => {
    const html = renderBannerBody('<script>alert(1)</script><a>ready</a>');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<span class="accent">ready</span>');
    expect(html).not.toContain("<script>");
  });

  it("renders file tree dirs closed with a single disclosure glyph", () => {
    const html = renderTree([{ type: "dir", name: "src", depth: 0, children: [{ type: "file", name: "main.js", depth: 1 }] }]);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("data-tree-children hidden");
    expect(html).toContain('<span class="glyph">▸</span>');
    expect(html).not.toContain('class="caret"');
  });
});
