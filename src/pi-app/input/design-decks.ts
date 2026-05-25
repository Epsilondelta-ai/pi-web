const DESIGN_DECK_FENCE = /```json\s*([\s\S]*?)```/gi;

function clipped(value, maxLength) {
  return String(value ?? "").slice(0, maxLength);
}

function normalizeOption(option) {
  if (!option?.label || !option?.previewHtml) return undefined;
  return {
    label: clipped(option.label, 120),
    description: option.description ? clipped(option.description, 1000) : "",
    aside: option.aside ? clipped(option.aside, 2000) : "",
    recommended: option.recommended === true,
    previewHtml: clipped(option.previewHtml, 20_000),
  };
}

function normalizeSlide(slide, index) {
  const options = (Array.isArray(slide?.options) ? slide.options : [])
    .slice(0, 4)
    .map(normalizeOption)
    .filter(Boolean);
  if (!options.length) return undefined;
  return {
    id: clipped(slide.id || `slide-${index + 1}`, 120),
    title: clipped(slide.title || `Design ${index + 1}`, 200),
    context: slide.context ? clipped(slide.context, 1000) : "",
    options,
  };
}

function normalizeDeck(parsed) {
  if (parsed?.type !== "piweb_design_deck") return undefined;
  const sourceSlides = Array.isArray(parsed.slides)
    ? parsed.slides
    : [{ id: parsed.id || "design", title: parsed.title || "Design preview", context: parsed.context, options: parsed.options }];
  const slides = sourceSlides.slice(0, 4).map(normalizeSlide).filter(Boolean);
  if (!slides.length) return undefined;
  return {
    id: clipped(parsed.id || "design-deck", 120),
    title: clipped(parsed.title || "Design preview", 200),
    slides,
  };
}

export function parseDesignDecks(text = "") {
  const decks = [];
  for (const match of text.matchAll(DESIGN_DECK_FENCE)) {
    try {
      const deck = normalizeDeck(JSON.parse(match[1]));
      if (deck) decks.push(deck);
    } catch {}
  }
  return decks;
}

export function stripDesignDecks(text = "") {
  return text.replace(DESIGN_DECK_FENCE, (block, json) => {
    try {
      return normalizeDeck(JSON.parse(json)) ? "" : block;
    } catch {
      return block;
    }
  }).trim();
}
