# `piweb` internal package map

`internal/piweb` is intentionally kept as one package for now so handlers, stores, and tests can share unexported helpers without introducing premature Go package boundaries.

Use filename prefixes as the navigation boundary:

| Area | Files |
| --- | --- |
| HTTP server | `server*.go`, `server_*_test.go`, `server_static.go` |
| Session APIs | `pi_session*.go`, `session_*.go`, `team_sessions.go` |
| Workspace APIs | `workspace_ops.go`, `files.go`, `folders.go`, `file_preview.go`, `server_workspace_handlers.go` |
| Runner/process events | `runner*.go`, `commands.go`, `broker.go` |
| Store/database | `store*.go`, `web_db.go`, `store_*_test.go` |
| Settings/runtime/quota | `settings.go`, `runtime_status.go`, `quota_*.go`, `pi_rpc_status.go` |
| Shared types/helpers | `types.go`, `redact.go` |

## Split rule

Create a new Go subpackage only when all of these are true:

1. the code has a stable API boundary,
2. it does not need access to unexported `piweb` internals,
3. tests can stay meaningful without cross-package fixtures,
4. the move reduces imports/coupling instead of adding adapters.

Until then, prefer small files with feature prefixes over many tightly coupled subpackages.
