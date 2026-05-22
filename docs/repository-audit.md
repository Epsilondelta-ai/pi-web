# Repository organization audit

Last reviewed: 2026-05-21

## Verdict

The repository now has clear ownership boundaries. The remaining large flat areas are intentional:

- `backend/internal/piweb` stays as one Go package to avoid premature exported APIs.
- `src/pi-app` is split by browser feature and keeps tests colocated.
- `.pi/extensions` is project-local Pi configuration/extension code, not application runtime code.

## Folder map

| Path | Purpose | Status |
| --- | --- | --- |
| `.github/workflows/` | CI split by backend/frontend checks | OK |
| `.pi/` | Pi harness settings, prompts, local extensions, npm sandbox placeholder | OK; generated sessions/tasks/npm contents ignored |
| `.pi/extensions/` | Project-local Pi footer/quota/web-status extensions | OK; entrypoints at root, implementation under `src/` |
| `.storybook/` | Storybook config and fixtures | OK |
| `backend/cmd/pi-web/` | CLI/binary entrypoint, update command, committed static embed assets | OK |
| `backend/internal/piweb/` | Go HTTP/session/workspace/store/runner package | OK; documented in `backend/internal/piweb/README.md` |
| `docs/` | Durable docs and task history | OK |
| `docs/assets/` | README/documentation images | OK |
| `docs/plans/` | Durable implementation plans moved out of ignored `.pi/tasks` | OK |
| `public/` | Browser-served static assets | OK |
| `scripts/` | User-facing install/helper scripts | OK |
| `src/components/` | React UI components | OK |
| `src/design-system/` | Global design tokens | OK |
| `src/lib/` | Frontend API/rendering/pure helpers | OK |
| `src/pages/` | Astro page entrypoints | OK |
| `src/pi-app/` | `<pi-app>` shell plus feature folders | OK |
| `src/styles/parts/` | CSS modules imported by `src/styles.css` | OK |

## Cleanup applied in this audit

- Moved documentation images from `docs/` to `docs/assets/`.
- Folded `src/extras.css` into `src/styles/parts/empty-shell.css` and imported it from `src/styles.css`.
- Renamed `src/design-system/colors_and_type.css` to `src/design-system/tokens.css`.
- Confirmed ignored generated folders are not tracked: `.astro/`, `dist/`, `storybook-static/`, `storybook-server/`, `.pi/tasks/`, `.pi/npm/*`, `node_modules/`.

## Follow-up only if the codebase grows

- Split `backend/internal/piweb` into subpackages only when APIs are stable and tests do not need cross-package fixtures.
- Split `.pi/extensions/src/quota.ts` into smaller orchestration files if quota providers continue to grow.
- Consider `apps/` / `packages/` only if more deployable apps or shared packages are added.
