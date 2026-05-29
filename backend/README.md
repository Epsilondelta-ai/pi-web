# Backend layout

Root-level `backend/` is documentation only. The Go backend implementation lives under `internal/piweb`.

```text
.
├── main.go / server.go       # binary entrypoint, CLI flags, static embedding, update command
├── internal/piweb/facade.go  # public backend facade used by root entrypoint
├── internal/piweb/backend/   # HTTP API, runner, store, workspace/session implementation
├── internal/piweb/shared/    # shared DTOs and redaction helpers
├── internal/piweb/eventbus/  # SSE event broker primitives
└── static/                   # embedded Astro build for release binaries
```

Rules:
- Do not put implementation code in root `backend/`; it is a docs/navigation folder.
- Root Go files own process startup and binary concerns only.
- `internal/piweb` root stays facade-only.
- Implementation code belongs in `internal/piweb/backend` until it is split into wired domain packages.
- Static assets stay under `static` so release binaries include the UI.

See `../internal/piweb/README.md` for the internal backend package map.
