import { describe, expect, it } from "vitest";
import { parseDesignDecks, stripDesignDecks } from "./design-decks";

describe("pi-web design deck parser", () => {
  it("normalizes defaults, clips optional fields, and limits slides/options", () => {
    const deck = {
      type: "piweb_design_deck",
      options: [
        { label: "A".repeat(130), description: "d".repeat(1100), aside: "a".repeat(2100), previewHtml: "<b>A</b>", recommended: false },
        { label: "B", previewHtml: "b".repeat(21_000), recommended: true },
        { label: "skip missing preview" },
        { previewHtml: "skip missing label" },
        { label: "C", previewHtml: "<b>C</b>" },
        { label: "D", previewHtml: "<b>D</b>" },
        { label: "E", previewHtml: "<b>E</b>" },
      ],
    };

    const [parsed] = parseDesignDecks(["```json", JSON.stringify(deck), "```"].join("\n"));

    expect(parsed.id).toBe("design-deck");
    expect(parsed.title).toBe("Design preview");
    expect(parsed.slides[0].id).toBe("design");
    expect(parsed.slides[0].title).toBe("Design preview");
    expect(parsed.slides[0].context).toBe("");
    expect(parsed.slides[0].options).toHaveLength(2);
    expect(parsed.slides[0].options[0].label).toHaveLength(120);
    expect(parsed.slides[0].options[0].description).toHaveLength(1000);
    expect(parsed.slides[0].options[0].aside).toHaveLength(2000);
    expect(parsed.slides[0].options[0].recommended).toBe(false);
    expect(parsed.slides[0].options[1].previewHtml).toHaveLength(20_000);
    expect(parsed.slides[0].options[1].recommended).toBe(true);
  });

  it("ignores invalid decks and keeps non-design JSON fences", () => {
    const text = [
      "before",
      "```json",
      JSON.stringify({ type: "other", options: [{ label: "A", previewHtml: "<b>A</b>" }] }),
      "```",
      "```json",
      JSON.stringify({ type: "piweb_design_deck", slides: [{ id: "empty", options: [] }] }),
      "```",
      "```json",
      "{bad",
      "```",
    ].join("\n");

    expect(parseDesignDecks(text)).toEqual([]);
    expect(stripDesignDecks(text)).toContain('"type":"other"');
    expect(stripDesignDecks(text)).toContain("{bad");
  });

  it("limits explicit slides and removes valid deck fences", () => {
    const deck = {
      type: "piweb_design_deck",
      id: "deck-id",
      title: "Deck",
      slides: [
        { options: "not an array" },
        { options: [{ label: 123, previewHtml: true }] },
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `s${index}`,
          title: `Slide ${index}`,
          context: "ctx",
          options: [{ label: `Option ${index}`, previewHtml: `<b>${index}</b>` }],
        })),
      ],
    };
    const text = ["intro", "```json", JSON.stringify(deck), "```", "outro"].join("\n");

    const [parsed] = parseDesignDecks(text);

    expect(parsed.id).toBe("deck-id");
    expect(parsed.title).toBe("Deck");
    expect(parsed.slides).toHaveLength(3);
    expect(parsed.slides[0].id).toBe("slide-2");
    expect(parsed.slides[0].title).toBe("Design 2");
    expect(parsed.slides[0].options[0].label).toBe("123");
    expect(parsed.slides[0].options[0].previewHtml).toBe("true");
    expect(parsed.slides[1].context).toBe("ctx");
    expect(stripDesignDecks(text)).toBe("intro\n\noutro");
  });
});
