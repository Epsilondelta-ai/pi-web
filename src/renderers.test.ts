// @ts-nocheck
import { describe, expect, it } from "vitest";
import { renderBannerBody, renderPiBody } from "./renderers";

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

  it("opens markdown links in a new tab", () => {
    const html = renderPiBody("[docs](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("escapes untrusted banner html before restoring allowed tokens", () => {
    const html = renderBannerBody('<script>alert(1)</script><a>ready</a>');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<span class="accent">ready</span>');
    expect(html).not.toContain("<script>");
  });
});
