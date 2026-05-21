# Folder cleanup plan

## Evidence

- Current root mixes product source, Go backend, generated outputs, docs, configs, and task notes.
- Root generated/check-in candidates: `dist/`, `storybook-static/`, `.astro/`, maybe embedded static output under `backend/cmd/pi-web-server/static/`.
- Frontend source is split between root-level `src/*.ts`, `src/pi-app/*`, `src/components/*`, `src/design-system/*`, and style folders.
- Backend has 49 files flat under `backend/internal/piweb`, which is past the point where package-by-feature helps navigation.
- External examples converge on: deployable apps in `apps/`, shared libraries in `packages/`, docs in `docs/`, scripts in `scripts/`, root reserved for workspace/config/license/readme.

## Target shape

```text
pi-web/
  apps/
    web/                 # Astro/React UI, public assets, Storybook if app-specific
    server/              # Go binary entrypoint + internal packages
  packages/
    ui/                  # reusable React/design-system pieces
    pi-client/           # frontend API/types/client helpers
  docs/                  # architecture, development, operation notes
  scripts/               # build/release/dev helpers
  .github/               # CI
  package.json           # workspace orchestration only
  go.work                # if Go modules are split; otherwise keep one go.mod at root initially
```

## Incremental migration

1. **Stop tracking generated output first**
   - Verify whether `dist/`, `storybook-static/`, `.astro/` are committed intentionally.
   - If not required: add to `.gitignore`, remove from git index, keep build scripts generating them.
   - Keep embedded binary assets only if release process requires committed assets; otherwise generate during `build:binary`.

2. **Document ownership boundaries**
   - `apps/web`: deployable browser app.
   - `apps/server`: deployable Go server/binary.
   - `packages/*`: imported by apps, no process/runtime ownership.
   - `docs`: durable docs only; move ad-hoc notes/tasks under `.pi/tasks` or delete after completion.

3. **Frontend reshape**
   - Move Astro app files to `apps/web/src` and `apps/web/public`.
   - Move generic `src/components` + `src/design-system` to `packages/ui/src` only if reused; otherwise keep under app.
   - Move API/client-only helpers to `packages/pi-client/src` if shared with tests/storybook; otherwise keep app-local.
   - Keep tests next to source during moves to preserve context.

4. **Backend reshape**
   - First split flat `backend/internal/piweb` by responsibility without module changes:
     - `sessions/`, `workspace/`, `runner/`, `settings/`, `server/`, `store/`.
   - Only after green tests, consider moving `backend/` to `apps/server/`.
   - Prefer package boundaries that match user-facing features, not technical layers alone.

5. **Root cleanup**
   - Keep: `README.md`, `LICENSE`, `AGENTS.md`, `package.json`, lockfile, root config files, `go.mod`/`go.sum` until Go move.
   - Move: one-off notes to `.pi/tasks` or `docs/decisions` if durable.
   - Rename scripts to explicit verbs, e.g. `scripts/embed-assets.*` if script grows beyond package command.

6. **Verification gates after each move**
   - `bun run typecheck`
   - `bun run test`
   - `bun run backend:test`
   - `bun run build`
   - `bun run build-storybook`

## Recommended order

1. Generated artifacts/gitignore cleanup.
2. Root docs/tasks cleanup.
3. Backend package-by-feature split inside existing `backend/`.
4. Frontend internal folder grouping inside existing `src/`.
5. Optional monorepo move to `apps/` and `packages/` after tests are stable.

## Decision needed before implementation

- Conservative path: clean generated files + regroup inside current structure.
- Full monorepo path: migrate to `apps/web`, `apps/server`, `packages/*` with config/script updates.

Recommendation: conservative first, then monorepo move only if more apps/packages are expected.
