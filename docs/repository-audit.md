# Repository organization audit

Last reviewed: 2026-05-30

## Verdict

The repository has clear ownership boundaries and no tracked generated-output or fake-domain shadow folders.

## Folder map

| Path | Purpose | Status |
| --- | --- | --- |
| `.github/workflows/` | CI/release workflows | OK |
| `.pi/` | Pi harness settings, prompts, local extensions, npm sandbox placeholder | OK; generated sessions/tasks/npm contents ignored |
| `.pi/extensions/` | Project-local Pi footer/quota/web-status extensions | OK; entrypoints at root, implementation under `src/` |
| `.storybook/` | Storybook config and fixtures | OK |
| `bin/` | npm CLI shim | OK |
| `cmd/pi-web/` | Go binary entrypoint and embedded release assets | OK |
| `cmd/pi-web/static/` | Committed embedded Astro assets for release binaries | OK |
| `internal/piweb/` | Public backend facade over implementation packages | OK; documented in `internal/piweb/README.md` |
| `internal/piweb/backend/` | Go HTTP/session/workspace/store/runner implementation | OK |
| `internal/piweb/eventbus/` | SSE event broker primitives | OK |
| `internal/piweb/shared/` | Backend DTOs/redaction helpers | OK |
| `docs/` | Durable docs and task history | OK |
| `docs/assets/` | README/documentation images | OK |
| `public/` | Astro static source assets | OK |
| `scripts/` | User-facing install/helper scripts | OK |
| `src/app-shell/` | Astro shell fragments | OK |
| `src/design-system/` | Global design tokens | OK |
| `src/pages/` | Astro page entrypoints | OK |
| `src/pi-app/` | `<pi-app>` shell plus feature folders | OK |
| `src/shared/` | Frontend API/rendering/pure helpers | OK |
| `src/styles/parts/` | CSS modules imported by `src/styles.css` | OK |

## Cleanup applied

- Removed root-level `backend/` docs-only folder.
- Moved Go command entrypoint from root to `cmd/pi-web/`.
- Moved committed embedded assets from root `static/` to `cmd/pi-web/static/`.
- Kept root `internal/piweb` facade-only and moved implementation under `internal/piweb/backend/`.
- Removed `_domain` symlink/fake shadow tree and duplicate extraction packages.
- Confirmed ignored generated folders are not tracked: `.astro/`, `dist/`, `coverage/`, `storybook-static/`, `storybook-server/`, `.pi/tasks/`, `.pi/npm/*`, `node_modules/`.

## Rule

Add new files to the owning directory above. Do not add implementation code or generated assets to repository root.
