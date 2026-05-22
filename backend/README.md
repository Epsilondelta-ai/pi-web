# Backend layout

The backend is a Go server that embeds the Astro build into a single `pi-web` binary.

```text
backend/
├── cmd/pi-web/              # CLI, update command, binary entrypoint
└── internal/piweb/          # HTTP API, pi runner, session/workspace store
```

## Rules

- `cmd/pi-web` owns process startup, CLI flags, version/update behavior, and static embedding.
- `internal/piweb` owns testable server behavior and workspace/session domain logic.
- Static assets are committed under `cmd/pi-web/static` so `go install` can build a complete UI.
- Keep Go tests next to the file/feature they cover.

See `backend/internal/piweb/README.md` for the internal package map.
