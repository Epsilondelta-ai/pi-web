# Backend layout

The backend is organized by domain under `internal/piweb/_domain`, with stable cross-domain DTOs in the real `internal/piweb/shared` package.

The root `internal/piweb/*.go` files are compatibility facades/symlinks into those domain folders. This keeps the public `piweb` API intact while domains are split into real Go packages behind narrow boundaries.

```text
internal/piweb/
├── shared/             # real Go package for DTOs and redaction helpers
├── auth/               # real Go package for auth and OAuth helpers
├── commands/           # real Go package for command discovery helpers
├── eventbus/           # real Go package for SSE event broker primitives
├── files/              # real Go package for workspace file/folder helpers
├── git/                # real Go package for git history/commit detail operations
├── runtime/            # real Go package for quota payload calculations
├── runnerapi/          # runner-facing interfaces
├── sessions/           # real Go package for session parsing and session file metadata
├── storeapi/           # store-facing interfaces for dependency inversion
├── workspace/          # real Go package for clone/shell workspace operations
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
│   ├── shared/         # root facade aliases for shared package compatibility
│   ├── store/          # workspace/session store and web DB persistence
│   ├── test/           # broad coverage and integration-style package tests
│   └── workspace/      # workspace settings and shell/git clone operations
└── *.go -> _domain/... # compatibility symlinks for package piweb
```

Rules:
- Add new backend files to the matching `_domain/<domain>/` folder.
- Add only the root symlink needed for Go package compatibility.
- Do not create new root-owned Go files unless they are temporary migration shims.
- Put dependency-free DTOs/helpers in `internal/piweb/shared` first.
- Put session file parsing/page/summarization code in `internal/piweb/sessions`.
- Put standalone git history operations in `internal/piweb/git`.
- Put file/folder helpers in `internal/piweb/files`.
- Put auth/OAuth helpers in `internal/piweb/auth`.
- Put command discovery helpers in `internal/piweb/commands`.
- Put quota calculation helpers in `internal/piweb/runtime`.
- Put event broker primitives in `internal/piweb/eventbus`.
- Put store/runner contracts in `internal/piweb/storeapi` and `internal/piweb/runnerapi` before moving concrete orchestration.
- Put clone/shell workspace operations behind the small `workspace.Store` interface in `internal/piweb/workspace`.
- Keep concrete store/runner/server in the root facade until their callers consume the extracted interfaces.
