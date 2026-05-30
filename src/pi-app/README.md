# `src/pi-app`

`src/pi-app` contains the `<pi-app>` custom element shell plus feature method groups.

```text
src/pi-app/
├── index.ts          # custom element registration and method composition
├── constants.ts      # shared browser storage/constants
├── test-helper.ts    # shared DOM fixture helpers
├── editor/           # file preview, editing, and syntax highlighting
├── input/            # prompt input, attachments, drafts, fallback choices
├── messages/         # transcript message and tool output rendering
├── sessions/         # session list, hierarchy, storage, and switching
├── status/           # runtime status, version, layout, and toast UI
├── transcript/       # virtualized transcript window helpers
└── workspace/        # workspace bootstrap, folders, settings, and rendering
    └── components/   # workspace-owned React components
```

Keep tests next to the feature they exercise. New custom-element methods should live in the feature folder and be composed in `index.ts`.

Shared cross-feature modules live in `src/shared/<domain>/`; do not add new generic files to `src/lib`.
