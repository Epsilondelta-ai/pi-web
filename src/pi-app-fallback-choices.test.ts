// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupPiAppFixture, connectPiApp, installPiAppFixture } from "./pi-app-test-helper";

const fallbackChoicePayload = JSON.stringify({
  type: "piweb_choice",
  id: "runtime",
  question: "Runtime?",
  options: [{ label: "Go", value: "go" }],
  allowCustom: false,
});

const customFallbackChoicePayload = JSON.stringify({
  type: "piweb_choice",
  id: "runtime",
  question: "Runtime?",
  options: [{ label: "Go", value: "go", description: "Use Go" }],
  allowCustom: true,
});

const fallbackChoiceJson = ["```json", fallbackChoicePayload, "```"].join("\n");
const customFallbackChoiceText = ["Pick one", "```json", customFallbackChoicePayload, "```"].join("\n");

describe("pi-app fallback choices", () => {
  beforeEach(installPiAppFixture);
  afterEach(cleanupPiAppFixture);

  it("replaces streamed fallback choice JSON with clickable answer options", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendDelta({ kind: "pi", delta: "질문입니다\n`" });
    app.appendDelta({ kind: "pi", delta: `\`\`json${fallbackChoiceJson.slice(7)}` });
    expect(app.querySelector(".msg.streaming .body").textContent).toBe("질문입니다");
    expect(app.querySelector(".msg.streaming .body").textContent).not.toContain("piweb_choice");
    expect(app.querySelector(".fallback-choice-list")).toBeNull();

    app.appendMessage({ kind: "pi", text: `질문입니다\n${fallbackChoiceJson}` });
    expect(app.querySelector(".msg.streaming")).toBeNull();
    expect(app.querySelector(".fallback-choice-list strong").textContent).toBe("Runtime?");
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).not.toContain("piweb_choice");
  });

  it("renders fallback choice blocks as clickable answer options", async () => {
    const app = await connectPiApp();
    app.renderMessages([]);
    app.appendMessage({ kind: "pi", text: customFallbackChoiceText });
    expect(app.querySelector(".fallback-choice-list strong").textContent).toBe("Runtime?");
    expect(app.querySelector("[data-action='fallback-choice'] .choice-label").textContent).toBe("Go");
    expect(app.querySelector("[data-choice-custom-input]").placeholder).toBe("직접 답변 입력");
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).toContain("Pick one");
    expect(app.querySelector(".msg[data-kind='pi'] .body").textContent).not.toContain("piweb_choice");
  });

  it("allows custom answers from the choice panel", async () => {
    const app = await connectPiApp();
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    app.apiConnected = true;
    app.dataset.activeSessionId = "s1";
    app.renderMessages([]);
    app.appendMessage({ kind: "pi", text: fallbackChoiceJson });

    const input = app.querySelector("[data-choice-custom-input]");
    input.value = "custom runtime";
    app.querySelector("[data-action='fallback-choice-custom']").click();
    await Promise.resolve();

    expect(app.querySelector(".fallback-choice-list").classList.contains("answered")).toBe(true);
    expect(app.querySelector("[data-action='fallback-choice']").disabled).toBe(true);
    expect(input.disabled).toBe(true);
    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body)).toEqual({
      text: "선택지 응답:\nid: runtime\nvalue: custom runtime",
      attachments: [],
    });
  });

  it("disables already answered fallback choices on reload", async () => {
    const app = await connectPiApp();
    app.renderMessages([
      { kind: "pi", text: customFallbackChoiceText },
      { kind: "user", text: "선택지 응답:\nid: runtime\nvalue: go" },
    ]);
    expect(app.querySelector(".fallback-choice-list").classList.contains("answered")).toBe(true);
    expect(app.querySelector("[data-action='fallback-choice']").disabled).toBe(true);
    expect(app.querySelector("[data-choice-custom-input]").disabled).toBe(true);
  });
});
