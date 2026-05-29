# Backend layout

The backend keeps the public `piweb` package at `internal/piweb` and separates only boundaries that are actually wired.

```text
internal/piweb/
├── shared/             # real Go package for DTOs and redaction helpers
├── eventbus/           # real Go package for SSE event broker primitives
├── _domain/            # source-of-truth domain grouping for root package files
│   ├── auth/           # API keys and OAuth login flow
│   ├── commands/       # slash/native command discovery and cache
│   ├── files/          # workspace files, folders, previews, context files
│   ├── git/            # git status, history, commit details
│   ├── notifications/  # Discord/Telegram notifications
│   ├── runner/         # pi process runner, AG-UI stream, broker facade
│   ├── runtime/        # model/runtime/quota/update/package status
│   ├── server/         # HTTP server, routing, static files, handlers
│   ├── sessions/       # pi session parsing, pagination, parent/team metadata
│   ├── shared/         # root facade aliases for shared package compatibility
│   ├── store/          # workspace/session store and web DB persistence
│   ├── test/           # broad coverage and integration-style package tests
│   └── workspace/      # workspace settings and shell/git clone operations
└── *.go -> _domain/... # compatibility symlinks for package piweb, except wired facades
```

Rules:
- Add new backend implementation files to the matching `_domain/<domain>/` folder.
- Add a root symlink/facade only when the root `piweb` API needs it.
- Keep real subpackages only when root code actually imports them; no unused duplicate packages.
- Put dependency-free DTOs/helpers in `internal/piweb/shared`.
- Put event broker primitives in `internal/piweb/eventbus`; `piweb.Broker` is the facade.
- Split another real package only as part of wiring root callers to that package in the same change.
