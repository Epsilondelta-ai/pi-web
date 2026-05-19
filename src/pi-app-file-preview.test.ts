import { afterEach, describe, expect, it } from "vitest";
import "./pi-app";
import { renderHighlightedCode } from "./pi-app/file-highlight";

async function waitForHighlight(code) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (code.innerHTML.includes("style=\"color:")) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("highlight did not render");
}

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

  it("renders clicked text files with a highlighted editable overlay", async () => {
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
    await waitForHighlight(code);
    expect(code.textContent).toContain('const answer = "yes";');
    expect(code.textContent).toContain("// done");
    expect(code.innerHTML).toContain("style=\"color:");
    expect(app.querySelector("[data-action='save-file-preview']").hidden).toBe(false);
  });

  it("updates highlighting as the editable preview changes", async () => {
    const app = mountPreview();
    app.renderFilePreview({ path: "demo.js", mime: "text/javascript", previewKind: "text", content: "let x = 1;" });

    const editor = app.querySelector("[data-file-preview-editor]");
    editor.value = "function demo() { return 2; }";
    editor.dispatchEvent(new Event("input"));

    const code = app.querySelector(".fp-highlight code");
    await waitForHighlight(code);
    expect(code.textContent).toContain("function demo() { return 2; }");
    expect(code.innerHTML).toContain("style=\"color:");
  });

  it("escapes unsupported text files instead of injecting markup", async () => {
    const html = await renderHighlightedCode('<script>alert("x")</script>', {
      path: "plain.txt",
      mime: "text/plain",
    });

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
