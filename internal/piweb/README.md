# Backend layout

The backend keeps the public `piweb` package at `internal/piweb` and separates only boundaries that are actually wired.

```text
internal/piweb/
├── *.go                # root piweb package: store, runner, server, handlers, domain helpers
├── shared/             # real Go package for DTOs and redaction helpers
└── eventbus/           # real Go package for SSE event broker primitives
```

Rules:
- Do not add symlink shadow trees or duplicate package copies.
- Keep real subpackages only when root code imports them in the same change.
- Put dependency-free DTOs/helpers in `internal/piweb/shared`.
- Put event broker primitives in `internal/piweb/eventbus`; `piweb.Broker` is the facade.
- Keep runner dependencies narrowed through `EventSink` and `SessionMessageStore` before moving process code.
- Split another real package only as part of wiring root callers to that package in the same change.
