# Architecture-based refactor completion plan

Last updated: 2026-05-30
Status: complete; backend implementation packages extracted through server phase and verified.

## Completed baseline

```text
.
├── cmd/pi-web/                 # Go binary entrypoint and embedded release assets
├── internal/piweb/             # public backend facade only
│   ├── facade.go
│   ├── backend/                # implementation package, being split by domain
│   │   ├── auth/               # DONE: auth/OAuth helpers
│   │   ├── commands/           # DONE: pi/native slash command discovery
│   │   ├── files/              # DONE: workspace file/folder/git-status operations
│   │   ├── git/                # DONE: git history/commit detail operations
│   │   ├── notifications/      # DONE: Discord/Telegram notification side effects
│   │   ├── runner/             # DONE: pi process/RPC streaming
│   │   ├── runtime/            # DONE: model/quota/version/update status
│   │   ├── server/             # DONE: HTTP orchestration
│   │   ├── sessions/           # DONE: session parsing and metadata
│   │   ├── store/              # DONE: state/cache/persistence
│   │   └── workspace/          # DONE: clone/shell/settings
│   ├── eventbus/               # DONE: SSE event broker primitives
│   └── shared/                 # DONE: backend DTOs and redaction helpers
├── src/                        # DONE: frontend feature/shared structure
└── docs/                       # durable docs/assets
```

Completed work:

- root Go entrypoint moved to `cmd/pi-web/`.
- embedded release assets moved to `cmd/pi-web/static/`.
- root `internal/piweb` is facade-only.
- backend implementation moved behind `internal/piweb/backend`.
- fake `_domain` symlink tree removed.
- duplicate/unwired packages removed.
- frontend loose `src/lib` and root components moved into domain/shared structure.
- real backend packages wired for `shared`, `eventbus`, `files`, `git`, `auth`, and `commands`.

## Perfect end state

The refactor is complete when:

1. Repository root contains only metadata, manifests, and tool config.
2. `cmd/pi-web` owns binary startup and embedded static assets only.
3. `internal/piweb` root is facade-only.
4. `internal/piweb/backend` has no god-package implementation files.
5. Every backend domain with stable boundaries is a real package.
6. No real package is a copied/unwired duplicate.
7. Imports flow one way; no cycles.
8. Tests live with the package whose behavior they verify.
9. `bun run check` passes.

Target backend structure:

```text
internal/piweb/
├── facade.go
├── shared/
├── eventbus/
└── backend/
    ├── server/
    ├── store/
    ├── runner/
    ├── sessions/
    ├── runtime/
    ├── notifications/
    ├── workspace/
    ├── auth/          # done
    ├── commands/      # done
    ├── files/         # done
    └── git/           # done
```

## Dependency rules

Allowed direction:

```text
facade
  -> backend/server
  -> backend/store, backend/runner, backend/runtime, backend/auth, backend/commands,
     backend/workspace, backend/notifications
  -> backend/sessions, backend/files, backend/git, eventbus, shared
```

Hard rules:

- `shared` imports no project-local package.
- `eventbus` imports only `shared`.
- `files` imports only `shared` and stdlib.
- `git` imports only stdlib.
- `auth` imports only stdlib.
- `commands` may own local process helpers for the pi command RPC path.
- `sessions` must not import store, runner, or server.
- `store` may import sessions/files/git/shared.
- `runner` must not import server.
- `server` composes concrete implementations.
- root `internal/piweb` stays facade-only.

## Remaining phases

### Phase 2 — sessions package — DONE

Goal: move session parsing/file metadata into `internal/piweb/backend/sessions`.

Move:

- `pi_session_message_page.go`
- `pi_session_messages.go`
- `pi_session_summaries.go`
- `pi_sessions.go`
- `session_dirs.go`
- `session_parent.go`
- `session_sources.go`
- `team_sessions.go`
- focused tests for those files

Required API:

```go
type ParsedSession struct { ... }
type MessagePage struct { ... }

func DefaultDir() string
func DefaultTeamsDir() string
func CreateFile(cwd string) (shared.Session, string, error)
func Load(dir string) ([]ParsedSession, error)
func ParseFile(path string) (ParsedSession, error)
func ParseLine(line string) (shared.Message, bool)
func ParseLineMessages(line string) []shared.Message
func ParseMessagePage(path string, limit int, before string) (MessagePage, error)
func LoadSummaries(dir string, limit int) ([]ParsedSession, error)
func WithTeamChildren(sessions []ParsedSession) []ParsedSession
func DirForCWD(cwd string) string
func WorkspaceIDFromPath(path string) string
func IsAgentChildSession(cwd string, sessionFile string) bool
```

Known blockers found during implementation attempt:

- direct identifier replacement corrupts names (`SessionMessagePage`, `ParsePiSessionLineMessages`, etc.); this phase must be hand-edited.
- `workspaceIDFromPath` depends on slug behavior also used by store.
- `contentImageAttachments` needs `shared.PromptAttachment` and image extension helper ownership.
- notification code needs session header/team-child helpers through exported wrappers.

Exit criteria:

- store imports `backend/sessions` for loading/parsing/page operations.
- runner imports `backend/sessions` for tailed JSONL message parsing.
- notifications import `backend/sessions` for child/parent session checks.
- no `pi_session*`, `session_*`, or `team_sessions` implementation remains in backend root.

### Phase 3 — workspace/settings package — DONE

Goal: move clone/shell/settings into `internal/piweb/backend/workspace`.

Move:

- `workspace_ops.go`
- `settings.go`

Required API:

```go
type Store interface {
    OpenWorkspace(path string) (shared.Workspace, error)
    WorkspacePath(workspaceID string) (string, error)
}

func CloneGit(ctx context.Context, store Store, req shared.CloneWorkspaceRequest) (shared.Workspace, string, error)
func RunShell(ctx context.Context, store Store, workspaceID, command string) (shared.ShellCommandResult, error)
func Settings(root string) (SettingsResponse, error)
func SaveSettings(root string, patch SettingsPatchRequest) (SettingsResponse, error)
func ReadSettingsFile(path string) (map[string]any, error)
```

Exit criteria:

- server workspace handlers import `backend/workspace` for clone/shell/settings.
- runtime package can call settings through exported API.

### Phase 4 — runtime package — DONE

Goal: move model/quota/version/update/package status into `internal/piweb/backend/runtime`.

Move:

- `models.go`
- `pi_package_updates.go`
- `pi_rpc_status.go`
- `pi_update.go`
- `pi_version.go`
- `quota_payloads.go`
- `quota_status.go`
- `runtime_status.go`
- tests for those files

Required dependencies first:

- `workspace.ReadSettingsFile` exported.
- `workspace.Settings` exported.
- `auth.AuthPath` / `auth.ReadAuthFile` exported and already available.
- process helpers moved to `backend/process` or duplicated locally with build tags.
- `PiVersionStatus` and `PiUpdateStatus` referenced via `shared` or runtime-owned aliases.

Known blockers found during implementation attempt:

- `models.go` depends on `WorkspaceSettings`.
- `pi_package_updates.go` depends on `readSettingsFile` and process helpers.
- `pi_rpc_status.go` / `pi_version.go` depend on process helpers.
- `pi_update.go` depends on `PiUpdateStatus` aliases and process helpers.

Exit criteria:

- server imports `backend/runtime` for version/update/runtime endpoints.
- backend root has no `pi_*`, `quota_*`, `runtime_status`, or `models` implementation files.

### Phase 5 — notifications package — DONE

Goal: move Discord/Telegram side effects into `internal/piweb/backend/notifications`.

Move:

- `discord_notifications.go`
- notification tests

Required first:

- sessions package exports parent/team-child helpers.
- workspace/settings package exports settings API.
- fallback-choice detection has a stable home.

Exit criteria:

- runner calls notifications through a small notifier interface.
- notifications imports sessions/workspace/shared, not runner/server.

### Phase 6 — store package — DONE

Goal: move state/cache/persistence into `internal/piweb/backend/store`.

Move:

- `store.go`
- `store_mock.go`
- `store_sessions.go`
- `store_utils.go`
- `store_workspace.go`
- `web_db.go`
- store tests

Required first:

- sessions package complete.
- workspace/settings package complete.
- runtime/file/git dependencies stable.

Exit criteria:

- server depends on store through `ServerStore` interface.
- root facade aliases `store.Store` as public `piweb.Store`.

### Phase 7 — runner package — DONE

Goal: move process/RPC streaming into `internal/piweb/backend/runner`.

Move:

- `runner.go`
- `runner_events.go`
- `runner_tail.go`
- `agui.go`
- process helpers if not in `backend/process`
- runner/agui tests

Required first:

- sessions package complete.
- notifications package complete or notifier interface finalized.
- event sink and session store interfaces already exist.

Exit criteria:

- server owns a `runner.Runner` through `ServerRunner`.
- backend root has no runner process lifecycle files.

### Phase 8 — server package — DONE

Goal: move HTTP orchestration into `internal/piweb/backend/server`.

Move:

- `server.go`
- `server_session_handlers.go`
- `server_workspace_handlers.go`
- `server_static.go`
- `command_cache.go` if still server-owned
- server tests

Required first:

- store package complete.
- runner package complete.
- runtime/workspace/notifications package complete.

Exit criteria:

- `internal/piweb/backend` root is removed or assembly-only.
- `internal/piweb/facade.go` exports public constructors/types from final packages.

## Verification after each phase

```bash
go test $(go list ./... | grep -v '/node_modules/')
bun run lint
bun run typecheck
bun run test
bun run build:binary
bun run build-storybook
```

Final audit commands:

```bash
git status --short
find internal/piweb -maxdepth 3 -type d | sort
go list ./internal/piweb/...
```
