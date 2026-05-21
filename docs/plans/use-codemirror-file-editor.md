## Goal

- Replace the custom editable file preview/editor with a CodeMirror 6-based editor that provides reliable text editing, syntax highlighting, and save-state handling.

## Task List

### Research

- [x] Inspect the current editable file preview flow. Completion criteria: identify the file loading, editable detection, render, dirty state, save, error, and read-only paths.
- [x] [Parallelizable] Review CodeMirror 6 package requirements for vanilla TypeScript integration. Completion criteria: choose the minimal package set for editor view, state, commands, search, language support, and theming.
- [x] [Parallelizable] Review current syntax highlighting and file type detection logic. Completion criteria: decide which existing Shiki/file-highlight helpers can be reused or removed.

### Design

- [x] Define editable file eligibility rules. Completion criteria: text, binary, image, large file, generated file, and permission/error cases have explicit behavior.
- [x] Define the CodeMirror integration boundary. Completion criteria: editor mount, unmount, file content updates, dirty detection, read-only mode, and save callbacks are documented.
- [x] Define language mapping by file extension and filename. Completion criteria: JavaScript, TypeScript, JSON, Markdown, HTML, CSS, shell, Go, and unknown text files have expected editor modes or fallbacks.
- [x] Define keyboard and save UX. Completion criteria: Ctrl/Cmd+S, dirty indicator, save success, save failure, reload confirmation, and external file selection behavior are specified.

### Implementation

- [x] Add CodeMirror 6 dependencies. Completion criteria: the project installs the selected CodeMirror packages and builds without bundler errors.
- [x] Implement a file editor wrapper module. Completion criteria: the wrapper creates, updates, focuses, and destroys an EditorView without leaking DOM or listeners.
- [x] Integrate CodeMirror into the editable file preview panel. Completion criteria: editable files render in CodeMirror instead of the current editor implementation.
- [x] Connect editor changes to dirty state. Completion criteria: changed content marks the file dirty, unchanged content clears dirty state, and switching files handles unsaved changes safely.
- [x] Connect save behavior to the existing backend/API. Completion criteria: saving writes the current CodeMirror document, updates clean baseline content, and reports errors without losing edits.
- [x] Add read-only and non-editable fallbacks. Completion criteria: binary/image/large/read-only files continue to use preview or explanatory states, not a broken editor.
- [x] Apply pi-web visual styling to CodeMirror. Completion criteria: typography, colors, selection, gutter, scrollbars, and dark theme fit the existing UI.
- [x] Remove or isolate replaced custom editor code. Completion criteria: old editable textarea/contenteditable behavior no longer owns editable file rendering.

### Tests

- [x] Add unit tests for editable file eligibility. Completion criteria: text, binary, image, large, missing, and read-only cases are covered.
- [x] Add unit tests for extension-to-language mapping. Completion criteria: common project file types and unknown text fallback are covered.
- [x] Add frontend tests for editor lifecycle. Completion criteria: open file, edit content, dirty indicator, save success, save failure, and file switch behavior are verified.
- [x] Add regression tests for preview fallback behavior. Completion criteria: non-editable files still render the expected preview/status UI.

### Verification

- [x] Run typecheck. Completion criteria: `bun run typecheck` passes.
- [x] Run unit tests. Completion criteria: `bun run test` passes.
- [x] Run backend tests if save/load APIs are touched. Completion criteria: `bun run backend:test` passes or not-applicable is documented.
- [x] Run production build. Completion criteria: `bun run build` passes.
- [x] Run Storybook build if affected UI stories exist or are added. Completion criteria: `bun run build-storybook` passes or a blocker is documented.

## Progress Log

- 2026-05-20 22:41: created task list
- 2026-05-21 00:26: CodeMirror file editor implemented, verified, built as local binary, and installed to `~/.local/bin/pi-web`.
