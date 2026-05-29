# Backend layout

`internal/piweb` is now a public facade over a real backend implementation package.

```text
internal/piweb/
├── facade.go           # stable public API exported to the CLI/server entrypoint
├── backend/            # implementation package: store, runner, server, handlers, domain helpers, tests
├── shared/             # DTOs and redaction helpers shared across backend packages
└── eventbus/           # SSE event broker primitives consumed by backend.Broker
```

Rules:
- Keep `internal/piweb` root facade-only: aliases, constructors, and public API passthroughs.
- Put implementation code and package-level tests in `internal/piweb/backend`.
- Keep dependency-free DTOs/helpers in `internal/piweb/shared`.
- Keep event broker primitives in `internal/piweb/eventbus`; `backend.Broker` is the facade used by server/runner code.
- Do not add duplicate packages, symlink shadow trees, or unwired extraction copies.
- Split a new real package only when callers are wired to it in the same change.
