import { describe, expect, it } from "vitest";
import { renderBannerBody, renderPiBody } from "./renderers.js";

describe("safe inline markup rendering", () => {
  it("escapes untrusted pi message html before restoring allowed tokens", () => {
    const html = renderPiBody('<img src=x onerror="alert(1)"><tool>bash</tool><code>x</code><cursor></cursor>');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('<span class="tool-ref">bash</span>');
    expect(html).toContain("<code>x</code>");
    expect(html).not.toContain("<img");
  });

  it("escapes untrusted banner html before restoring allowed tokens", () => {
    const html = renderBannerBody('<script>alert(1)</script><a>ready</a>');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<span class="accent">ready</span>');
    expect(html).not.toContain("<script>");
  });
});
