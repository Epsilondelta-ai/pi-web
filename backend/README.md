# Backend layout

The backend is a Go server embedded into the root `pi-web` binary package.

```text
.
├── *.go                     # CLI, update command, binary entrypoint
├── internal/piweb/          # HTTP API, pi runner, session/workspace store
└── static/                  # embedded Astro build for `go install`
```

## Rules

- Root Go files own process startup, CLI flags, version/update behavior, and static embedding.
- `internal/piweb` owns testable server behavior and workspace/session domain logic.
- Static assets are committed under `static` so `go install` can build a complete UI.
- Keep Go tests next to the file/feature they cover.

See `../internal/piweb/README.md` for the internal package map.
