# Re:ZERO Tools

<!-- rezero-init: v0.1.0 -->

## Detected Stack

- JavaScript/TypeScript frontend package: `package.json`, `bun.lock`, `astro.config.ts`, `tsconfig.json`.
- Astro + React browser UI: `astro`, `@astrojs/react`, `react`, `react-dom` dependencies.
- Unit/integration test stack: `vitest.config.ts`, `vitest.setup.ts`, `bun run test`, `bun run test:coverage`.
- Backend/binary stack: `go.mod`, `cmd/pi-web`, `internal`, `bun run backend:test`.
- Existing CI: `.github/workflows/frontend.yml`, `.github/workflows/backend.yml`, `.github/workflows/release.yml`.

## Installed/Configured

- Echidna/Sekhmet: existing ESLint + TypeScript quality gates — `bun run lint`, `bun run typecheck`.
- Typhon: TypeScript compiler and Go compiler checks — `bun run typecheck`, `go test $(go list ./... | grep -v '/node_modules/')`.
- Minerva: Vitest, Go tests, Astro build, Storybook build — `bun run test`, `bun run backend:test`, `bun run build`, `bun run build-storybook`.
- Daphne: existing local performance checks with Lighthouse dependency — `bun run check:perf`.
- Carmilla: Storybook visual surface and browser-performance probes — `bun run storybook`, `bun run check:perf`.
- Satella: existing local CI-equivalent aggregate — `bun run check`.

## Verified Commands

- `bun --version` → `1.3.5`.
- `node --version` → `v25.4.0`.
- `go version` → `go version go1.26.0 darwin/arm64`.
- `bunx --bun eslint --version` → `v10.4.1`.
- `bunx --bun tsc --version` → `Version 5.9.3`.
- `bunx --bun vitest --version` → `vitest/4.1.8 darwin-arm64 node-v24.3.0`.
- `bunx --bun astro --version` → `astro v6.4.3`.
- `bunx --bun storybook --version` → `10.4.2`.
- `bunx --bun lighthouse --version` → `13.3.0`.

## Skipped

- Local SonarQube — not installed; existing `lint`, `typecheck`, tests, coverage, and builds are the active quality gates.
- Playwright — not installed; current project has Vitest/Storybook/performance probes but no Playwright config.
- axe — not installed; no existing accessibility-test setup detected.
- Spectral/Pact/k6 — skipped; no OpenAPI schema or service-contract/load-test setup detected.
- OSV-Scanner/Knip/source-map-explorer/hyperfine/CodeQL/Gitleaks/Trivy — not installed; add only when the requested evaluation needs them.

## Local Services

- None configured by Re:ZERO init.

## Required Environment

- Use project-local Bun dependencies; run `bun install` if `node_modules/` is absent.
- Performance checks may require local browser support through the existing Lighthouse/Puppeteer setup.
- `.rezero/memory/` is intentionally ignored for Re:ZERO private loop memory.
