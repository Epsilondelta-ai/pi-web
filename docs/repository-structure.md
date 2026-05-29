# Repository structure

This repository keeps the root focused on project metadata and tool configuration. Runtime entrypoints live in purpose-specific directories.

## Current layout

```text
.
├── cmd/pi-web/                 # Go binary entrypoint and embedded release assets
│   └── static/                 # committed Astro build embedded into release binaries
├── internal/piweb/             # backend facade, implementation, shared DTOs, event bus
├── src/                        # Astro/React frontend source
│   ├── app-shell/              # Astro shell fragments
│   ├── design-system/          # design tokens/components
│   ├── pages/                  # Astro pages
│   ├── pi-app/                 # custom element shell plus feature folders and tests
│   └── shared/                 # frontend API, rendering, pure data helpers
├── public/                     # Astro static source assets
├── docs/                       # durable documentation, plans, and screenshots
├── scripts/                    # install/release/dev helper scripts
├── bin/                        # npm CLI shim
├── .github/                    # GitHub workflows
├── .storybook/                 # Storybook configuration
└── package.json                # top-level build/test/dev commands
```

## Root directory rule

Keep only files expected at repository root:

- project metadata: `README.md`, `LICENSE`, `AGENTS.md`
- package/module manifests and lockfiles: `package.json`, `bun.lock`, `go.mod`, `go.sum`
- tool configuration: `astro.config.ts`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`, `eslint.config.js`
- VCS/editor configuration: `.gitignore`, `.npmignore`, `.github/`, `.storybook/`

Everything else should live under a purpose-specific directory:

- Go command entrypoint -> `cmd/pi-web/`
- backend implementation -> `internal/piweb/`
- frontend source -> `src/`
- browser static source assets -> `public/`
- embedded release assets -> `cmd/pi-web/static/`
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

Committed static embed assets live in `cmd/pi-web/static/` so release binaries include a complete UI.

Regenerate them with:

```bash
bun run build
bun run build-storybook
bun run embed:assets
```

## Internal cleanup rules

- Keep `docs/assets` for README/documentation images and `docs/plans` for durable implementation plans.
- Keep `src/shared` for pure helpers and browser API clients that are not custom-element methods.
- Keep `src/pi-app` for the `<pi-app>` element, feature folders, and their colocated tests.
- Keep backend package maps in `internal/piweb/README.md` current when moving files.
