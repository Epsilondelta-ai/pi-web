# Tasks

## Completed in this pass

- Re-audit Astro rewrite for Storybook, interaction, test, and maintainability gaps.
- Restore Storybook state coverage: workspace, picker, empty session, disconnected compaction, collapsed sidebar, and no file tree.
- Add app props for rendering preview states without mutating runtime code.
- Extract the browser custom element runtime into `src/pi-app.js`.
- Add custom element registration guard for Storybook/HMR.
- Restore key interactions: slash filtering/navigation, file-tree node toggles, sidebar resize, safer collapsed sidebar handling, and attachment removal.
- Keep existing safe inline markup tests passing.

## Still open

- Split `src/App.astro` into smaller Astro partials after the state surface settles.
- Add browser-level E2E tests for prompt attachments and sidebar resize.
- Wire real `pi --serve` data instead of mock fixtures.
