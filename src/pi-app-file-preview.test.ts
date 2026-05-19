import { afterEach, describe, expect, it } from "vitest";
import "./pi-app";
import { renderHighlightedCode } from "./pi-app/file-highlight";

function mountPreview() {
  document.body.innerHTML = `
    <pi-app>
      <div class="file-preview-modal" data-file-preview hidden>
        <div class="fp-dialog">
          <div class="fp-head">
            <div><strong class="fp-path">file</strong><small></small></div>
            <div class="fp-actions">
              <button type="button" data-action="save-file-preview" hidden>save</button>
              <button type="button" data-action="toggle-file-preview-mode" hidden>text</button>
              <button type="button" data-action="close-file-preview">×</button>
            </div>
          </div>
          <div class="fp-body"></div>
        </div>
      </div>
    </pi-app>
  `;
  return document.querySelector("pi-app");
}

describe("file preview highlighting", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders clicked text files with a highlighted editable overlay", () => {
    const app = mountPreview();
    app.renderFilePreview({
      path: "src/demo.ts",
      mime: "text/typescript",
      previewKind: "text",
      content: "const answer = \"yes\";\n// done",
    });

    const preview = app.querySelector("[data-file-preview]");
    const editor = app.querySelector("[data-file-preview-editor]");
    const code = app.querySelector(".fp-highlight code");

    expect(preview.hidden).toBe(false);
    expect(editor.value).toBe("const answer = \"yes\";\n// done");
    expect(code.innerHTML).toContain('<span class="syntax-keyword">const</span>');
    expect(code.innerHTML).toContain('<span class="syntax-string">"yes"</span>');
    expect(code.innerHTML).toContain('<span class="syntax-comment">// done</span>');
    expect(app.querySelector("[data-action='save-file-preview']").hidden).toBe(false);
  });

  it("updates highlighting as the editable preview changes", () => {
    const app = mountPreview();
    app.renderFilePreview({ path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });

    const editor = app.querySelector("[data-file-preview-editor]");
    editor.value = "function demo() { return 2; }";
    editor.dispatchEvent(new Event("input"));

    const code = app.querySelector(".fp-highlight code");
    expect(code.innerHTML).toContain('<span class="syntax-keyword">function</span>');
    expect(code.innerHTML).toContain('<span class="syntax-number">2</span>');
  });

  it("escapes unsupported text files instead of injecting markup", () => {
    const html = renderHighlightedCode('<script>alert("x")</script>', {
      path: "plain.txt",
      mime: "text/plain",
    });

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
