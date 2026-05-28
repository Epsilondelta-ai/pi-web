// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "../test-helper";

describe("pi-app messages", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("keeps message methods safe when transcript containers are absent", async () => {
    const app = await connectPiApp();
    app.termInner = null;
    expect(() => app.renderMessages([{ kind: "pi", text: "ignored" }])).not.toThrow();
    expect(() => app.appendMessage({ kind: "pi", text: "ignored" })).not.toThrow();
    expect(() => app.appendMessage()).not.toThrow();
    expect(() => app.appendDelta({ kind: "pi", delta: "ignored" })).not.toThrow();
  });

  it("renders and clears the connected welcome banner", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);

    expect(app.querySelector("[data-welcome-banner]").textContent).toContain("____  _");
    expect(app.textContent).not.toContain("connecting to local backend");

    app.appendMessage({ kind: "user", text: "hello" });
    expect(app.querySelector("[data-welcome-banner]")).toBeNull();
  });

  it("renders banner, thinking, image, fallback choice, and unknown messages", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);

    app.appendMessage({ kind: "banner", text: "<a>ready</a>" });
    app.appendMessage({ kind: "think", text: "<reason>" });
    app.appendMessage({ kind: "user", text: "see", attachments: [{ type: "image", dataUrl: "data:image/png;base64,a", name: "shot" }] });
    app.appendMessage({ kind: "custom", value: 1 });
    app.appendMessage({
      kind: "pi",
      text: [
        "```json",
        '{"type":"piweb_choice","id":"c1","question":"Pick?","options":[{"label":"A","value":"a","description":"Alpha"},{"label":"B","value":"b"}],"allowCustom":false}',
        "```",
      ].join("\n"),
    });

    expect(app.querySelector(".ascii-banner").textContent).toContain("ready");
    expect(app.querySelector(".thinking-block").textContent).toContain("<reason>");
    expect(app.querySelector(".msg-image").getAttribute("alt")).toBe("shot");
    expect(app.querySelector(".fallback-choice-list [data-choice-value='a'] small").textContent).toBe("Alpha");
    expect(app.querySelector("[data-choice-custom-input]")).not.toBeNull();
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).toContain("value");

    app.appendMessage({ kind: "user", text: "unnamed", attachments: [{ type: "image", dataUrl: "data:image/png;base64,b" }] });
    expect([...app.querySelectorAll(".msg-image")].at(-1).getAttribute("alt")).toBe("attached image");

    app.disableAnsweredChoice();
    const savedTerm = app.termInner;
    app.termInner = null;
    app.disableAnsweredChoice("missing");
    app.termInner = savedTerm;
    app.disableAnsweredChoice("c1");
    expect(app.querySelector(".fallback-choice-list").classList.contains("answered")).toBe(true);
    expect(app.querySelector(".fallback-choice-list button").disabled).toBe(true);
  });

  it("renders pi-web design deck previews from assistant JSON", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    const deck = {
      type: "piweb_design_deck",
      id: "design-direction",
      title: "Design directions",
      slides: [{
        id: "direction",
        title: "Direction",
        context: "Pick a visual direction.",
        options: [{
          label: "Terminal Pro",
          description: "Keep the terminal identity.",
          aside: "Recommended for low-risk iteration.",
          recommended: true,
          previewHtml: "<div>mockup</div>",
        }],
      }],
    };

    app.appendMessage({ kind: "pi", text: ["Here are the mockups.", "```json", JSON.stringify(deck), "```"].join("\n") });

    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).toContain("Here are the mockups.");
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).not.toContain("piweb_design_deck");
    expect(app.querySelector(".design-deck-panel .design-deck-head strong").textContent).toBe("Design directions");
    expect(app.querySelector(".design-slide-title").textContent).toBe("Direction");
    expect(app.querySelector(".design-option-card[data-recommended='true'] strong").textContent).toBe("Terminal Pro");
    expect(app.querySelector(".design-preview-frame").getAttribute("sandbox")).toBe("");
    expect(app.querySelector(".design-preview-frame").srcdoc).toBe("<div>mockup</div>");
  });

  it("renders streamed pi-web design deck when the response completes", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    const deck = {
      type: "piweb_design_deck",
      id: "streamed-design",
      title: "Streamed design",
      options: [{ label: "A", previewHtml: "<div>A</div>" }],
    };
    const text = ["Mockups incoming", "```json", JSON.stringify(deck), "```"].join("\n");

    app.appendDelta({ kind: "pi", delta: text.slice(0, 24) });
    app.appendDelta({ kind: "pi", delta: text.slice(24) });
    app.flushStreamingRender();
    expect(app.querySelector(".design-deck-panel")).toBeNull();

    app.finalizeStreamingMessages();

    expect(app.querySelector(".msg.streaming")).toBeNull();
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).toContain("Mockups incoming");
    expect(app.querySelector(".design-deck-panel .design-deck-head strong").textContent).toBe("Streamed design");
    expect(app.querySelector(".design-preview-frame").srcdoc).toBe("<div>A</div>");
  });

  it("keeps malformed design deck JSON visible", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);

    app.appendMessage({ kind: "pi", text: "```json\n{bad\n```" });

    expect(app.querySelector(".design-deck-panel")).toBeNull();
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).toContain("{bad");
  });

  it("handles streaming and tool cleanup nodes with missing child elements", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    const streaming = document.createElement("div");
    streaming.className = "msg streaming";
    streaming.dataset.kind = "think";
    app.termInner.append(streaming);
    app.appendDelta({ kind: "think", delta: "ignored" });

    const tool = document.createElement("div");
    tool.className = "tool-card";
    tool.dataset.status = "running";
    app.termInner.append(tool);
    expect(() => app.finishRunningTools()).not.toThrow();
  });

  it("deduplicates echoed user prompts and removes loading on response", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendMessage({ kind: "user", text: "hello" });
    app.appendLoadingMessage();
    app.appendMessage({ kind: "user", text: "hello" });
    expect(app.querySelectorAll(".msg[data-kind='user']")).toHaveLength(1);
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    app.appendMessage({ kind: "pi", text: "world" });
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("renders user prompts through markdown with preserved line breaks", async () => {
    const app = await connectPiApp();
    const text = [
      "PR 올림: https://github.com/Epsilondelta-ai/juun-ai/pull/14",
      "",
      "Checks:",
      "- Branch pushed",
      "- PR created",
      "- Docs-only change",
    ].join("\n");
    app.renderMessages([]);
    app.appendMessage({ kind: "user", text });
    app.appendLoadingMessage();
    app.appendMessage({ kind: "user", text });

    const body = app.querySelector(".msg[data-kind='user'] .body");
    expect(app.querySelectorAll(".msg[data-kind='user']")).toHaveLength(1);
    expect(body.classList.contains("markdown-body")).toBe(true);
    expect(body.querySelector("a").textContent).toBe("https://github.com/Epsilondelta-ai/juun-ai/pull/14");
    expect([...body.querySelectorAll("p")].map((item) => item.textContent)).toEqual([
      "PR 올림: https://github.com/Epsilondelta-ai/juun-ai/pull/14",
      "Checks:",
    ]);
    expect([...body.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "Branch pushed",
      "PR created",
      "Docs-only change",
    ]);
  });

  it("reads assistant responses aloud when enabled in settings and exposes speaker replay", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    function Utterance(text) {
      this.text = text;
      this.lang = "";
    }
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    Object.defineProperty(navigator, "language", { value: "ko-KR", configurable: true });
    const app = await connectPiApp();
    app.renderMessages([]);

    app.appendMessage({ kind: "pi", text: "not spoken" });
    expect(speak).not.toHaveBeenCalled();
    expect(app.querySelector("[data-action='read-response']")).toBeNull();

    app.settingsState = { effective: { readResponsesAloud: true, voice: { engine: "browser", language: "ja-JP" } } };
    app.syncReadAloudFromSettingsState();
    const replay = app.querySelector("[data-action='read-response']");
    expect(replay.getAttribute("aria-label")).toBe("Read response aloud");
    expect(replay.querySelector("[data-lucide='volume-2']")).not.toBeNull();
    expect(app.querySelector("[data-action='stop-response'] [data-lucide='square']")).not.toBeNull();
    expect(replay.textContent).toBe("");

    app.appendMessage({ kind: "pi", text: "**spoken** response" });
    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: "spoken response", lang: "ja-JP" }));

    app.querySelector("[data-action='stop-response']").click();
    expect(cancel).toHaveBeenCalledTimes(2);

    replay.click();
    expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: "not spoken", lang: "ja-JP" }));

    app.settingsState = { effective: { readResponsesAloud: false } };
    app.syncReadAloudFromSettingsState();
    expect(app.querySelector("[data-action='read-response']")).toBeNull();
  });

  it("covers read aloud fallbacks and empty copy guards", async () => {
    const app = await connectPiApp();
    expect(app.speechTextFromAssistantText("```json\n{\"type\":\"piweb_choice\",\"id\":\"c\",\"question\":\"q\",\"options\":[{\"label\":\"A\",\"value\":\"a\"}]}\n```")).toBe("");
    app.speakAssistantText("");
    vi.stubGlobal("speechSynthesis", undefined);
    app.speakAssistantText("hello");
    app.readAssistantMessageNode(null);
    const row = document.createElement("div");
    row.className = "msg";
    row.dataset.kind = "pi";
    row.innerHTML = `<div class="body">body text</div>`;
    const originalSpeakAssistantText = app.speakAssistantText;
    app.speakAssistantText = vi.fn();
    app.readAssistantMessageNode(row);
    expect(app.speakAssistantText).toHaveBeenCalledWith("body text");
    app.readAssistantMessageNode(document.createElement("div"));
    expect(app.speakAssistantText).toHaveBeenCalledWith("");
    app.speakAssistantText = originalSpeakAssistantText;

    const speak = vi.fn();
    const cancel = vi.fn();
    function Utterance(text) { this.text = text; this.lang = ""; }
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    Object.defineProperty(navigator, "language", { value: "", configurable: true });
    app.voiceLanguage = "system";
    app.speechLanguage = "";
    app.speakAssistantText("hello");
    expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: "en-US" }));
    app.voiceLanguage = "";
    app.speechLanguage = "fr-FR";
    app.speakAssistantText("bonjour");
    expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: "fr-FR" }));

    const frenchVoice = { lang: "fr-FR", name: "French" };
    const resume = vi.fn();
    let readAloudIntervalCallback = () => undefined;
    vi.spyOn(globalThis, "setInterval").mockImplementation((callback) => {
      readAloudIntervalCallback = callback as () => void;
      callback();
      return 1 as never;
    });
    vi.stubGlobal("speechSynthesis", { speak, cancel, resume, getVoices: () => [frenchVoice] });
    app.speakAssistantText(`${"long sentence. ".repeat(20)}`);
    expect(resume).toHaveBeenCalled();
    const firstChunk = speak.mock.calls.at(-1)?.[0];
    expect(firstChunk.text.length).toBeLessThanOrEqual(180);
    expect(firstChunk.voice).toBe(frenchVoice);
    firstChunk.onend();
    expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ voice: frenchVoice }));
    const secondChunk = speak.mock.calls.at(-1)?.[0];
    secondChunk.onend();
    expect(app.readAloudMonitor).toBeUndefined();
    expect(app.readAloudUtterances.length).toBeGreaterThan(1);
    expect(app.speechTextChunks("x".repeat(400)).map((chunk) => chunk.length)).toEqual([180, 180, 40]);
    expect(app.speechTextChunks("")).toEqual([""]);
    expect(app.readAloudVoice()).toBe(null);
    app.speakAssistantText("still speaking");
    expect(app.readAloudMonitor).toBeTruthy();
    const stoppedChunk = speak.mock.calls.at(-1)?.[0];
    app.stopReadingResponse();
    readAloudIntervalCallback();
    stoppedChunk.onend();
    expect(speak).toHaveBeenLastCalledWith(stoppedChunk);
    expect(app.readAloudMonitor).toBeUndefined();

    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      const element = createElement(tagName, options);
      if (tagName === "div") Object.defineProperty(element, "textContent", { configurable: true, get: () => "" });
      return element;
    });
    expect(app.speechTextFromAssistantText("**visible**")).toBe("**visible**");
    vi.mocked(document.createElement).mockRestore();
    app.termInner = null;
    app.transcriptItems = [{ nodes: [row, null] }, undefined];
    app.syncReadAloudButton = vi.fn();
    app.readResponsesAloud = false;
    app.syncReadAloudControls();
    expect(app.syncReadAloudButton).toHaveBeenCalledWith(row);

    const button = document.createElement("button");
    await app.copyCodeBlock(button);
    expect(button.disabled).not.toBe(true);
  });

  it("copies markdown code blocks with button feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendMessage({ kind: "pi", text: ["```ts", "const ok = true;", "```"].join("\n") });

    const button = app.querySelector(".code-copy-btn");
    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("const ok = true;\n");
    expect(button.dataset.copyStatus).toBe("copied");
    expect(button.textContent).toBe("copied");
  });

  it("does not append new deltas to an old streaming row", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "old" });
    app.finalizeStreamingMessages();
    app.appendMessage({ kind: "user", text: "next" });
    app.appendDelta({ kind: "pi", delta: "new" });
    app.flushStreamingRender();
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["old", "new"]);
  });

  it("starts a new stream segment after tool cards", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "before" });
    app.appendMessage({ kind: "tool", tool: "bash", status: "running" });
    app.appendDelta({ kind: "pi", delta: "after" });
    app.flushStreamingRender();
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["before", "after"]);
  });

  it("covers fallback defaults for images and detached choice lookup", async () => {
    const app = await connectPiApp();
    const image = app.userMessageNode({ kind: "user", text: "img", attachments: [{ type: "image", dataUrl: "data:image/png;base64,x" }] });
    expect(image.querySelector("img").alt).toBe("attached image");
    const term = app.termInner;
    app.termInner = undefined;
    app.disableAnsweredChoice("missing");
    app.termInner = term;
  });

  it("finalizes uncached streaming rows", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    const row = app.simpleMessage("pi streaming", "pi >", "stream");
    row.classList.add("streaming");
    app.termInner.append(row);
    app.finalizeStreamingMessages();
    expect(row.classList.contains("streaming")).toBe(false);
  });

  it("keeps loading visible through tool activity until assistant output arrives", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "tool", tool: "read", status: "running" });
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    app.finishTool({ kind: "tool", tool: "read", status: "ok" });
    app.syncLoadingMessage();
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    app.setMode("idle");
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("renders lucide-style tool icons while unknown tools keep the dot", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);

    app.appendMessage({ kind: "tool", tool: "read", status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "git status" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "bun test" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "bun run build" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "bun install" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "bash", args: JSON.stringify({ command: "pwd" }), status: "ok" });
    app.appendMessage({ kind: "tool", tool: "unknown_tool", status: "ok" });

    const glyphs = [...app.querySelectorAll(".tool-card .tc-glyph")];
    expect(glyphs[0].querySelector("[data-tool-icon='book-open']")).not.toBeNull();
    expect(glyphs[1].querySelector("[data-tool-icon='git-branch']")).not.toBeNull();
    expect(glyphs[2].querySelector("[data-tool-icon='circle-check']")).not.toBeNull();
    expect(glyphs[3].querySelector("[data-tool-icon='hammer']")).not.toBeNull();
    expect(glyphs[4].querySelector("[data-tool-icon='package']")).not.toBeNull();
    expect(glyphs[5].querySelector("[data-tool-icon='terminal']")).not.toBeNull();
    expect(glyphs[6].querySelector("svg")).toBeNull();
    expect(glyphs[6].textContent).toBe("●");
  });

  it("renders retry tool markers as warnings", async () => {
    const app = await connectPiApp();
    app.renderMessages([{ kind: "tool", tool: "pi", status: "retry", resultMeta: "retrying 1/3", body: "Automatic retry marker" }]);
    const tool = app.querySelector(".tool-card");
    expect(tool.dataset.status).toBe("retry");
    expect(tool.querySelector(".tc-meta").textContent).toContain("retrying 1/3");
    expect(tool.querySelector(".tc-meta .retry")).not.toBeNull();
    expect(app.retryToolStatus({})).toContain("retrying");
  });

  it("marks stale running tools complete when assistant output resumes", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "tool", tool: "read", status: "running" });
    app.appendDelta({ kind: "pi", delta: "done" });
    const tool = app.querySelector(".tool-card");
    expect(tool.dataset.status).toBe("ok");
    expect(tool.querySelector(".tc-meta").textContent).toContain("done");
    expect(tool.querySelector(".tc-meta .spinner")).toBeNull();
  });

  it("marks stale running tools complete when a session becomes idle", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "tool", tool: "read", status: "running" });
    app.setMode("idle");
    const tool = app.querySelector(".tool-card");
    expect(tool.dataset.status).toBe("ok");
    expect(tool.querySelector(".tc-meta .spinner")).toBeNull();
  });

  it("keeps streaming deltas in one row while the session is running", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendDelta({ kind: "pi", delta: "hel" });
    app.appendDelta({ kind: "pi", delta: "lo" });
    app.flushStreamingRender();
    const bodies = [...app.querySelectorAll(".msg[data-kind='pi'] .body")].map((node) => node.textContent);
    expect(bodies).toEqual(["hello"]);
  });

  it("renders streaming assistant markdown", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "**bo" });
    app.appendDelta({ kind: "pi", delta: "ld**" });
    app.flushStreamingRender();
    const body = app.querySelector(".msg.streaming .body");
    expect(body.classList.contains("markdown-body")).toBe(true);
    expect(body.innerHTML).toContain("<strong>bold</strong>");
  });

  it("streams assistant deltas before the final message", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendLoadingMessage();
    app.appendDelta({ kind: "pi", delta: "hel" });
    app.appendDelta({ kind: "pi", delta: "lo" });
    app.flushStreamingRender();
    expect(app.querySelector(".msg.loading")).toBeNull();
    expect(app.querySelector(".msg.streaming .body").textContent).toBe("hello");
  });

  it("replaces streamed AG-UI text with one final assistant message", async () => {
    const app = await connectPiApp();
    const text = [
      "계획: `.pi/tasks/fix-agui-stream-duplicate-final-render.md` 확인",
      "",
      "- inline `code` 유지",
      "```ts",
      "const path = '.pi/tasks/example.md';",
      "```",
    ].join("\n");
    app.dataset.activeSessionId = "s1";
    app.renderMessages([]);

    const subscriber = app.aguiSubscriber("s1");
    subscriber.onRunStarted();
    subscriber.onTextDelta(text.slice(0, 12));
    subscriber.onTextDelta(text.slice(12));
    subscriber.onTextEnd(text);

    const messages = [...app.querySelectorAll(".msg[data-kind='pi']")];
    expect(messages).toHaveLength(1);
    expect(app.querySelector(".msg.streaming")).toBeNull();
    expect(messages[0].dataset.rawText).toBe(text);
    expect(messages[0].textContent).toContain("계획:");
    expect(messages[0].textContent).not.toContain("계획계획");
    expect(messages[0].textContent).not.toContain(". .pipi");
  });

  it("finalizes a virtualized streaming assistant row in transcript state", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "계획: `.pi/tasks/example.md`" });
    const streaming = app.querySelector(".msg.streaming[data-kind='pi']");
    app.termInner.replaceChildren();

    app.finalizePiStream("계획: `.pi/tasks/example.md`");

    const messages = [...app.querySelectorAll(".msg[data-kind='pi']")];
    expect(messages).toHaveLength(1);
    expect(messages[0]).not.toBe(streaming);
    expect(app.transcriptItems).toHaveLength(1);
    expect(app.transcriptItems[0].nodes).toEqual([messages[0]]);
    expect(app.streamingRows?.pi).toBeUndefined();
    expect(app.pendingStreamingRow).toBeUndefined();
  });

  it("does not show loading after a final assistant message while waiting for idle status", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendMessage({ kind: "pi", text: "complete answer" });
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("wraps streaming thinking deltas while keeping response loading visible", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.setMode("running");
    app.appendDelta({ kind: "think", delta: "rea" });
    app.appendDelta({ kind: "think", delta: "son" });
    const block = app.querySelector(".msg.streaming[data-kind='think'] .thinking-block");
    expect(app.querySelector(".msg.loading .spinner")).not.toBeNull();
    expect(block).not.toBeNull();
    expect(block.querySelector(".label").textContent).toBe("thinking");
    expect(block.querySelector("[data-stream-text]").textContent).toBe("reason");
  });

  it("batches streaming assistant markdown rendering to an animation frame", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "**bo" });
    app.appendDelta({ kind: "pi", delta: "ld**" });

    const body = app.querySelector(".msg.streaming .body");
    expect(body.textContent).toBe("");

    frames.splice(0).forEach((callback) => callback(0));

    expect(body.innerHTML).toContain("<strong>bold</strong>");
  });

  it("coalesces repeated terminal scroll requests into one animation frame", async () => {
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const app = await connectPiApp();
    app.scrollFrame = undefined;
    app.scrollTerm();
    app.scrollTerm();
    app.scrollTerm();

    expect(frames).toHaveLength(1);
  });

  it("covers message method fallback branches and clipboard fallback paths", async () => {
    const app = await connectPiApp();
    app.renderMessages([
      { kind: "user", text: "선택지 응답:\nid: answered\nvalue: yes" },
      { kind: "pi", text: "initial" },
    ]);
    expect(app.answeredChoiceIds.has("answered")).toBe(true);

    app.termInner = null;
    app.finalizePiStream("ignored");
    app.termInner = app.querySelector(".term-inner");
    app.renderMessages([]);
    app.appendMessage({ kind: "pi", text: "same" });
    app.appendLoadingMessage();
    app.appendMessage({ kind: "pi", text: "same" });
    expect(app.querySelectorAll(".msg[data-kind='pi']")).toHaveLength(1);
    const duplicateStream = app.simpleMessage("pi streaming", "pi >", "same");
    duplicateStream.classList.add("streaming");
    duplicateStream.dataset.kind = "pi";
    app.termInner.append(duplicateStream);
    app.streamingRows = { pi: duplicateStream };
    app.finalizePiStream("same");
    expect(app.querySelector(".msg.streaming")).toBeNull();
    app.appendDelta({ kind: "think", delta: "t" });
    app.appendMessage({ kind: "think", text: "final think" });
    expect(app.querySelector(".thinking-block")).toBeTruthy();

    const stale = app.simpleMessage("pi streaming", "pi >", "stale");
    stale.classList.add("streaming");
    stale.dataset.kind = "pi";
    const stale2 = app.simpleMessage("pi streaming", "pi >", "stale2");
    stale2.classList.add("streaming");
    stale2.dataset.kind = "pi";
    app.termInner.append(stale, stale2);
    app.streamingRows = { pi: stale };
    app.transcriptItems.push({ nodes: [stale] }, { nodes: [stale2] });
    app.finalizePiStream("fresh");
    expect([...app.querySelectorAll(".msg[data-kind='pi']")].at(-1).textContent).toContain("fresh");
    expect(stale2.isConnected).toBe(false);

    const pending = app.simpleMessage("think streaming", "…", "pending");
    pending.classList.add("streaming");
    pending.dataset.kind = "think";
    app.pendingStreamingRow = pending;
    app.streamingRows = { think: pending };
    app.clearStreamingState("think");
    expect(app.pendingStreamingRow).toBeUndefined();

    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "final" });
    const extra = app.simpleMessage("pi streaming", "pi >", "extra");
    extra.classList.add("streaming");
    extra.dataset.kind = "pi";
    app.termInner.append(extra);
    app.transcriptItems.push({ nodes: [extra] });
    app.finalizeStreamingMessages();
    expect(extra.isConnected).toBe(false);

    app.readResponsesAloud = true;
    app.syncReadAloudControls();
    app.syncReadAloudButton(document.createElement("div"));
    app.readAssistantMessageNode(undefined);
    expect(app.speechTextFromAssistantText(["```json", JSON.stringify({ type: "piweb_choice", id: "c", question: "q", options: [{ label: "A", value: "a" }] }), "```"].join("\n"))).toBe("");
    app.speakAssistantText("");
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    app.speakAssistantText("hello");

    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    Object.defineProperty(document, "execCommand", { value: vi.fn(), configurable: true });
    const exec = vi.spyOn(document, "execCommand").mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(app.copyTextToClipboard("fallback")).resolves.toBeUndefined();
    await expect(app.copyTextToClipboard("fallback")).rejects.toThrow("copy failed");
    expect(exec).toHaveBeenCalledWith("copy");

    const button = document.createElement("button");
    app.markCodeCopyButton(button, "failed");
    const firstTimer = button.copyResetTimer;
    app.markCodeCopyButton(button, "copied");
    expect(button.dataset.copyStatus).toBe("copied");
    expect(firstTimer).not.toBe(button.copyResetTimer);
    await new Promise((resolve) => window.setTimeout(resolve, 1410));
    expect(button.dataset.copyStatus).toBe("");
    expect(button.textContent).toBe("copy");
    expect(button.copyResetTimer).toBeUndefined();
    app.markCodeCopyButton(undefined, "copied");
    await app.copyCodeBlock(undefined);
    const codeButton = document.createElement("button");
    const block = document.createElement("div");
    block.className = "code-block";
    block.innerHTML = `<pre><code>copy me</code></pre>`;
    block.append(codeButton);
    app.copyTextToClipboard = vi.fn(async () => { throw new Error("no copy"); });
    await app.copyCodeBlock(codeButton);
    expect(codeButton.dataset.copyStatus).toBe("failed");
  });

  it("covers clear streaming pending row branch", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    const row = app.simpleMessage("pi streaming", "pi >", "x");
    row.classList.add("streaming");
    row.dataset.kind = "pi";
    app.pendingStreamingRow = row;
    app.streamingRows = { pi: row };
    app.clearStreamingState("pi");
    expect(app.pendingStreamingRow).toBeUndefined();
  });

  it("removes virtualized loading messages from transcript state", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendLoadingMessage();
    app.termInner.replaceChildren();

    app.appendLoadingMessage();
    expect(app.transcriptItems.filter((item) => item.nodes?.some((node) => node.matches?.(".msg.loading")))).toHaveLength(1);

    app.removeLoadingMessage();
    expect(app.transcriptItems.some((item) => item.nodes?.some((node) => node.matches?.(".msg.loading")))).toBe(false);
    expect(app.querySelector(".msg.loading")).toBeNull();
  });

  it("covers remaining message collection and fallback branches", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    expect(app.answeredChoiceIdsFrom([{ kind: "user", text: "선택지 응답:\nid: c1\nvalue: a" }]).has("c1")).toBe(true);
    const last = app.simpleMessage("pi", "pi >", "same");
    last.dataset.rawText = "same";
    app.appendTranscriptNode(last);
    expect(app.isDuplicateMessage({ kind: "pi", text: "same" })).toBe(true);
    delete last.dataset.rawText;
    last.querySelector(".body").textContent = "body same";
    expect(app.isDuplicateMessage({ kind: "pi", text: "body same" })).toBe(true);

    const cached = app.simpleMessage("pi streaming", "pi >", "cached");
    cached.classList.add("streaming");
    cached.dataset.kind = "pi";
    app.streamingRows = { pi: cached };
    app.termInner.append(cached);
    app.transcriptItems = [null, { nodes: [null, cached] }];
    expect(app.streamingRowsForKind("pi")).toContain(cached);
    app.pendingStreamingRow = cached;
    app.clearStreamingState("pi");
    expect(app.pendingStreamingRow).toBeUndefined();

    app.responseReceived = false;
    app.notifyResponseCompletedOnce = vi.fn();
    app.running = true;
    app.notifyPiMessageCommitted({ kind: "pi", text: "done" });
    expect(app.responseReceived).toBe(true);
    expect(app.notifyResponseCompletedOnce).not.toHaveBeenCalled();
    app.responseReceived = false;
    app.notifyPiMessageCommitted({ kind: "pi", text: "" });
    expect(app.responseReceived).toBe(false);

    const loading = app.simpleMessage("loading", "pi >", "loading");
    loading.classList.add("loading");
    app.transcriptItems = [null, { nodes: [null, loading] }];
    expect(app.loadingMessageNodes()).toContain(loading);
    app.deferTranscriptRender = true;
    app.removeLoadingMessage();
    app.deferTranscriptRender = false;

    const piNode = app.simpleMessage("pi", "pi >", "read me");
    piNode.dataset.kind = "pi";
    app.transcriptItems = [null, { nodes: [null, piNode] }];
    expect(() => app.syncReadAloudControls()).not.toThrow();
    app.termInner = null;
    app.answeredChoiceIds = new Set(["missing"]);
    expect(() => app.syncAnsweredChoices()).not.toThrow();

    app.voiceLanguage = "";
    app.speechLanguage = "";
    vi.stubGlobal("SpeechSynthesisUtterance", function SpeechSynthesisUtterance(text) { this.text = text; });
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: vi.fn() });
    vi.stubGlobal("navigator", { language: "" });
    app.speakAssistantText("hello");
    expect(globalThis.speechSynthesis.speak).toHaveBeenCalled();
  });
});
