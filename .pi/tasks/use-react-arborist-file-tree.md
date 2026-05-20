## Goal

- Replace the custom workspace file tree UI with a React Arborist-based file tree that supports scalable navigation and git-aware file status indicators.

## Task List

### Research

- [ ] Inspect the current workspace/file tree implementation and API payloads. Completion criteria: identify the rendering entry points, event handlers, CSS selectors, and backend data shape to replace.
- [ ] [Parallelizable] Review React Arborist integration requirements for Astro islands. Completion criteria: decide where the React component mounts and which Astro/React packages are required.
- [ ] [Parallelizable] Review git status data requirements for modified and newly created files. Completion criteria: define a `path -> status` map that covers modified, added, untracked, deleted, renamed, and clean files.

### Design

- [ ] Define the file tree node model. Completion criteria: document fields for id, name, path, kind, children, gitStatus, dirty descendants, selection state, and expanded state.
- [ ] Define the UI state contract between the custom element shell and the React Arborist island. Completion criteria: file selection, expand/collapse, refresh, context actions, and keyboard activation have explicit event boundaries.
- [ ] Define visual status rules for changed files and folders. Completion criteria: modified files, new/untracked files, deleted files, renamed files, and dirty parent folders have distinct badges or colors.

### Implementation

- [ ] Add React/Astro integration dependencies if they are not already present. Completion criteria: the project builds with a minimal React island.
- [ ] Implement the React Arborist file tree component. Completion criteria: the component renders the existing workspace file hierarchy with virtualization, selection, folder expansion, and custom node rendering.
- [ ] Connect file activation to the existing preview/editor flow. Completion criteria: clicking or pressing Enter on a file opens the same file content path as the current tree.
- [ ] Add git status loading to the workspace backend/API. Completion criteria: the frontend receives status for modified and newly created files without shelling out from the browser.
- [ ] Render file and folder git status indicators. Completion criteria: modified and new files are visible in the tree, and parent folders indicate descendant changes.
- [ ] Preserve existing workspace actions. Completion criteria: refresh, session/workspace switching, empty states, errors, and loading states still behave as before.
- [ ] Remove or isolate replaced custom tree rendering code. Completion criteria: old tree DOM generation no longer owns the file tree path, and remaining helpers are only used where needed.

### Tests

- [ ] Add unit tests for git status parsing and tree node decoration. Completion criteria: modified, untracked, added, deleted, renamed, nested, and clean paths are covered.
- [ ] Add frontend tests for React Arborist tree behavior. Completion criteria: file activation, selected state, folder expansion, and status badges are verified.
- [ ] Add regression coverage for workspace switching. Completion criteria: switching workspaces updates the tree data and clears stale selection/status safely.

### Verification

- [ ] Run typecheck. Completion criteria: `bun run typecheck` passes.
- [ ] Run unit tests. Completion criteria: `bun run test` passes.
- [ ] Run backend tests. Completion criteria: `bun run backend:test` passes.
- [ ] Run production build. Completion criteria: `bun run build` passes.
- [ ] Run Storybook build if affected UI stories exist or are added. Completion criteria: `bun run build-storybook` passes or a blocker is documented.

## Progress Log

- 2026-05-20 22:41: created task list
