# pi-web frontend entry performance

## Goal
Reduce first-entry latency in pi-web by removing unused heavy frontend work from startup and deferring backend metadata loads until needed.

## Findings
- `src/App.astro` mounts `WorkspaceFileTree` with `client:load`, so React tree code loads on first page load.
- `src/lib/material-file-icons.ts` eagerly imports the full material icon manifest and all SVG URLs.
- `src/pi-app/editor/file-preview-methods.ts` statically imports `CodeMirrorFileEditor`, pulling CodeMirror into the main app bundle.
- `src/pi-app/workspace/workspace-bootstrap-methods.ts` loads workspace metadata before session data, including filesystem walk and git status.
- Static assets show large startup chunks: app ~1MB raw, tree ~1.6MB raw, extra dependency chunk ~1.9MB raw.

## Reviewed constraints
- Split `file-editor.ts` helpers from CodeMirror implementation first; otherwise dynamic import still drags CodeMirror into startup.
- Tree deferral must be explicit: do not hydrate/load file tree while the tree panel is closed. Hydrate/load on user opening the tree panel, with optional idle preload only when already open.
- Bundle verification is required after build: inspect generated chunks for CodeMirror absence from the initial app chunk and tree/editor chunk separation.
- Bootstrap metadata deferral needs stale guards so old workspace metadata cannot update current UI after session/workspace changes.
- Material icon changes must preserve a synchronous fallback icon path or tests must cover loading/fallback behavior.

## Plan
1. Extract lightweight file-preview helpers from `file-editor.ts`; lazy-load `CodeMirrorFileEditor` only when editable preview mode is entered.
2. Replace `WorkspaceFileTree client:load` with an explicit deferred mount path that triggers when the tree panel is opened; keep closed tree as static placeholder.
3. Reduce material icon startup cost without breaking sync tree render: prefer manifest-only sync resolution plus a generic/fallback icon URL, then defer richer SVG mapping if needed.
4. Reorder `bootstrapAPI` so session transcript/input becomes interactive before `loadWorkspaceMeta`; guard delayed metadata with active workspace/session tokens.
5. Add focused tests for lazy editor import, tree-open trigger, bootstrap ordering, stale metadata guard, and icon fallback.
6. Verify with `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, plus bundle inspection of generated `static/assets` or `dist/assets` chunks.

## Success criteria
- Initial App chunk no longer contains CodeMirror editor modules/import terms.
- File tree chunk is not required before first interaction when the tree panel is closed.
- Transcript/input become usable before workspace file/git metadata completes.
- Opening the tree loads and renders files correctly after deferred metadata load.
- Editable file preview still opens, edits, saves, and refreshes metadata after lazy CodeMirror load.
- Material icon fallback renders synchronously if a specific SVG URL is unavailable.
- Checks and bundle inspection pass.
