# pi-web-ui

Astro frontend for controlling pi coding agent sessions in a browser.

## Frontend

```bash
npm install
npm run dev
npm run check
npm run build
npm run smoke
npm run preview
```

- Framework: Astro static output + TypeScript.
- Backend: not implemented yet. Go API will attach later.
- Design source: `/Users/juunini/Downloads/pi web.zip` from Claude Design.
- Imported safe assets: `public/favicon.svg`, `public/wordmark.svg`.
- Main page: `src/pages/index.astro`.

## Design mapping

The recovered pass translates the Claude Design zip into a phone-first static Astro app shell:

- 375×812 PiFrame/iOS-style mobile shell, centered on desktop and full-screen on small devices
- black terminal surfaces and ANSI green accent from `design-system/colors_and_type.css`
- Pi Web wordmark/favicon from `design-system/*.svg`
- workspace home, session list, terminal screen, D-pad/keypad, and prompt grammar from `pi-screens.jsx` + `styles/pi-web.css`
- multiline `>` prompt textarea, new-workspace bottom sheet, approval diff modal, and settings overlay
- smoke verification in `scripts/smoke-check.mjs`

No raw HTML from the zip is injected at runtime. All interactions are client-side only until the Go backend exists.
