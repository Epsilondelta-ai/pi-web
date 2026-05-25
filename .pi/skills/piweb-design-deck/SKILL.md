---
name: piweb-design-deck
description: Render visual design mockups directly inside pi-web transcript. Use when the user asks to show UI/design options, mockups, or design directions in pi-web instead of opening an external design_deck browser window.
---

# pi-web Design Deck

Use this skill when the user wants visual design options shown inside pi-web.

## When to use

- User asks for design 시안, UI mockups, visual options, or design review options.
- User is using pi-web and needs previews without an external browser.
- `design_deck` fails to open or would require refresh/external window.

## Output contract

Return a fenced JSON block with top-level `type: "piweb_design_deck"`.
Do not call the external `design_deck` tool for pi-web-native previews unless the user explicitly asks for the external deck.

```json
{
  "type": "piweb_design_deck",
  "id": "stable-short-id",
  "title": "Deck title",
  "slides": [
    {
      "id": "slide-id",
      "title": "Decision title",
      "context": "Short context for the decision.",
      "options": [
        {
          "label": "Option A",
          "description": "What this direction optimizes for.",
          "recommended": true,
          "aside": "Tradeoffs, implementation notes, or why this is recommended.",
          "previewHtml": "<div style='...'>self-contained mockup</div>"
        }
      ]
    }
  ]
}
```

## Rules

- Use 2-4 options per slide.
- Make options meaningfully different, not just color variants.
- `previewHtml` must be self-contained inline HTML/CSS.
- Keep HTML inert: no scripts, no network dependencies, no iframes inside preview HTML.
- Prefer realistic product copy and layout over generic hero/card filler.
- For pi-web itself, preserve the terminal/local-agent identity unless the user asks for a new brand.
- If the user picks an option, treat it as the implementation contract.

## Recommended option shape

- `label`: concise direction name.
- `description`: one-line summary.
- `recommended`: only for the strongest option.
- `aside`: why/impact/tradeoffs.
- `previewHtml`: visual mockup.

## pi-web-specific guidance

For pi-web design work, usually separate:

- top shell command input: direct workspace command execution.
- bottom composer: natural-language Pi instruction.
- center panel: session transcript or first-run guidance.
- mobile: compact brand instead of wide ASCII banners.

Make shell input visually obvious with `$` prefix, border, placeholder, and run button.
