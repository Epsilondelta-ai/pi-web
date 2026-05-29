# Backend layout

The backend is organized by domain under `internal/piweb/_domain`.

The root `internal/piweb/*.go` files are symlinks into those domain folders. This keeps Go's single `piweb` package intact while making file ownership visible by domain without a risky package-boundary rewrite.

```text
internal/piweb/
├── _domain/
│   ├── auth/           # API keys and OAuth login flow
│   ├── commands/       # slash/native command discovery and cache
│   ├── files/          # workspace files, folders, previews, context files
│   ├── git/            # git status, history, commit details
│   ├── notifications/  # Discord/Telegram notifications
│   ├── runner/         # pi process runner, broker, SSE, AG-UI stream
│   ├── runtime/        # model/runtime/quota/update/package status
│   ├── server/         # HTTP server, routing, static files, handlers
│   ├── sessions/       # pi session parsing, pagination, parent/team metadata
│   ├── shared/         # shared types, models, redaction
│   ├── store/          # workspace/session store and web DB persistence
│   ├── test/           # broad coverage and integration-style package tests
│   └── workspace/      # workspace settings and shell/git clone operations
└── *.go -> _domain/... # compatibility symlinks for package piweb
```

Rules:
- Add new backend files to the matching `_domain/<domain>/` folder.
- Add only the root symlink needed for Go package compatibility.
- Do not create new root-owned Go files unless they are temporary migration shims.
- Split into real Go subpackages only when the domain has a narrow exported API and no unexported cross-domain coupling.
