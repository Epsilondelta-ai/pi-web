# Repository structure

This repository keeps the root focused on entry points, tool configuration, and project metadata.

## Current layout

```text
.
├── *.go                        # root pi-web command for `go install github.com/.../pi-web`
├── backend/                    # backend layout notes
├── internal/piweb/             # server, sessions, workspace, runner, store code
├── static/                     # committed embedded Astro assets
├── docs/                       # durable documentation, plans, and screenshots
├── public/                     # Astro static assets
├── scripts/                    # install/release/dev helper scripts
├── src/                        # Astro/React frontend source
│   ├── components/             # shared UI components
│   ├── design-system/          # design tokens/components
│   ├── lib/                    # frontend API, rendering, pure data helpers
│   ├── pages/                  # Astro pages
│   └── pi-app/                 # custom element shell plus feature folders and tests
├── .github/                    # GitHub workflows
├── .storybook/                 # Storybook configuration
└── package.json                # top-level build/test/dev commands
```

## Root directory rule

Keep only files that are expected at repository root:

- project metadata: `README.md`, `LICENSE`, `AGENTS.md`
- root Go command files: `*.go`, required for `go install github.com/Epsilondelta-ai/pi-web@latest`
- package/module manifests and lockfiles: `package.json`, `bun.lock`, `go.mod`, `go.sum`
- tool configuration: `astro.config.ts`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`
- VCS/editor configuration: `.gitignore`, `.github/`, `.storybook/`

Everything else should live under a purpose-specific directory:

- durable docs and screenshots -> `docs/`
- helper scripts -> `scripts/`
- generated output -> ignored build directories
- temporary task notes -> `.pi/tasks/`; durable plans -> `docs/plans/`

## Generated output

These paths are generated locally and intentionally ignored:

- `.astro/`
- `dist/`
- `storybook-static/`
- `storybook-server/`

Committed static embed assets live in `static/` so `go install` builds a complete UI.

Regenerate them with:

```bash
bun run build
bun run build-storybook
bun run embed:assets
```

## Internal cleanup rules

- Keep `docs/assets` for README/documentation images and `docs/plans` for durable implementation plans.
- Keep `src/lib` for pure helpers and browser API clients that are not custom-element methods.
- Keep `src/pi-app` for the `<pi-app>` element, feature folders, and their colocated tests.
- Keep backend package maps in `backend/README.md` and `internal/piweb/README.md` current when moving files.

## Future migration option

If this grows beyond one web UI and one server, migrate incrementally toward the common monorepo shape:

```text
apps/web/       # Astro/React app
apps/server/    # Go server/binary
packages/ui/    # reusable UI/design-system code
packages/client/# shared API/types/client helpers
```

Do this only after the conservative cleanup is stable and tests are green.
