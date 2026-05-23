// @ts-nocheck
import { describe, expect, it } from "vitest";
import { escapeHtml, renderAnsiBody, renderBannerBody, renderPiBody, renderUserBody } from "./renderers";

describe("safe markdown rendering", () => {
  it("escapes untrusted pi message html before restoring allowed tokens", () => {
    const html = renderPiBody('<img src=x onerror="alert(1)"><tool>bash</tool><code>x</code><cursor></cursor>');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('<span class="tool-ref">bash</span>');
    expect(html).toContain("<code>x</code>");
    expect(html).not.toContain("<img");
  });

  it("renders assistant markdown", () => {
    const html = renderPiBody("**bold**\n\n- one\n- two");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("adds copy buttons to markdown code blocks", () => {
    const html = renderPiBody(["```ts", "const ok = true;", "```", "", "`inline`"].join("\n"));
    expect(html).toContain('class="code-block"');
    expect(html).toContain('data-action="copy-code"');
    expect(html).toContain('class="language-ts"');
    expect(html).toContain("const ok = true;");
    expect(html.match(/data-action="copy-code"/g)).toHaveLength(1);
  });

  it("renders user markdown with line breaks", () => {
    const html = renderUserBody([
      "PR 올림: https://github.com/Epsilondelta-ai/juun-ai/pull/14",
      "",
      "Checks:",
      "- Branch pushed",
      "- PR created",
      "- Docs-only change",
    ].join("\n"));
    expect(html).toContain("</p>\n<p>Checks:</p>");
    expect(renderUserBody("line one\nline two")).toContain("line one<br>\nline two");
    expect(html).toContain("<li>Branch pushed</li>");
    expect(html).toContain("<li>PR created</li>");
    expect(html).toContain("<li>Docs-only change</li>");
  });

  it("opens markdown links in a new tab", () => {
    const html = renderPiBody("[docs](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("escapes untrusted banner html before restoring allowed tokens", () => {
    const html = renderBannerBody('<script>alert(1)</script><a>ready</a><d>dim</d><t>tool</t>');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<span class="accent">ready</span>');
    expect(html).toContain('<span class="dim">dim</span>');
    expect(html).toContain('<span class="tool">tool</span>');
    expect(html).not.toContain("<script>");
  });

  it("escapes html scalar values", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml('&<>"\'')).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("restores pi ansi tags after escaping the body", () => {
    const html = renderAnsiBody("<a>ok</a><r>bad</r><y>warn</y><c>cyan</c><d>dim</d><t>tool</t><ad>add</ad><rm>rm</rm><x>&</x>");
    expect(html).toContain('<span class="ansi-green">ok</span>');
    expect(html).toContain('<span class="ansi-red">bad</span>');
    expect(html).toContain('<span class="ansi-yellow">warn</span>');
    expect(html).toContain('<span class="ansi-cyan">cyan</span>');
    expect(html).toContain('<span class="ansi-dim">dim</span>');
    expect(html).toContain('<span class="ansi-yellow">tool</span>');
    expect(html).toContain('<span class="added">add</span>');
    expect(html).toContain('<span class="removed">rm</span>');
    expect(html).toContain("&lt;x&gt;&amp;&lt;/x&gt;");
  });
});
