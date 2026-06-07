import { describe, expect, it } from "vitest";

import { PROMPT_DRAFT_STORAGE_KEY, SPINNER_FRAME_COUNT, TERMINAL_SPINNER_HTML } from "./constants";

describe("pi-app constants", () => {
  it("exports stable prompt and spinner constants", () => {
    expect(PROMPT_DRAFT_STORAGE_KEY).toBe("pi.promptDraft");
    expect(SPINNER_FRAME_COUNT).toBe(6);
    expect(TERMINAL_SPINNER_HTML.match(/<span/g)?.length).toBe(7);
  });
});
