# Architecture-based refactor completion plan

Last updated: 2026-05-30

## Current stable baseline

The repository is organized around clear runtime boundaries:

```text
.
├── cmd/pi-web/                 # Go binary entrypoint and embedded release assets
├── internal/piweb/             # public backend facade
│   ├── backend/                # backend implementation package
│   │   ├── auth/               # auth/OAuth helpers
│   │   ├── commands/           # pi/native slash command discovery
│   │   ├── files/              # workspace file/folder/git-status operations
│   │   └── git/                # git history/commit detail operations
│   ├── eventbus/               # SSE event broker primitives
│   └── shared/                 # backend DTOs and redaction helpers
├── src/                        # Astro/React frontend source
│   ├── app-shell/
│   ├── design-system/
│   ├── pages/
│   ├── pi-app/                 # feature folders for the custom element
│   └── shared/                 # frontend shared modules
└── docs/                       # durable docs/plans/assets
```

Already completed:

- root Go entrypoint moved to `cmd/pi-web/`.
- root `internal/piweb` is facade-only.
- backend fake `_domain` and symlink shadow tree removed.
- unused duplicate packages removed.
- frontend `src/lib` / loose components moved into domain/shared structure.
- real backend packages wired for `shared`, `eventbus`, `files`, `git`, `auth`, and `commands`.

## Definition of “perfect”

The project is perfectly organized when these conditions are true:

1. Repository root contains only metadata, manifests, and tool config.
2. `cmd/pi-web` owns binary startup and embedded static assets only.
3. `internal/piweb` root remains facade-only.
4. `internal/piweb/backend` no longer acts as a god package.
5. Every backend domain with stable boundaries is a real package, not a copied or unwired package.
6. Package imports flow one way; no cycles, no cross-domain hidden coupling.
7. Tests live with the package whose behavior they verify.
8. `bun run check` passes after every phase.

Target backend structure:

```text
internal/piweb/
├── facade.go
├── shared/
├── eventbus/
└── backend/
    ├── server/          # HTTP routing and request/response orchestration
    ├── store/           # workspace/session cache and persistence
    ├── runner/          # pi process/RPC lifecycle
    ├── sessions/        # JSONL session parsing, pagination, parent/team metadata
    ├── runtime/         # model/quota/version/update/package status
    ├── notifications/   # Discord/Telegram side effects
    ├── workspace/       # clone/shell/settings operations
    ├── auth/            # done
    ├── commands/        # done
    ├── files/           # done
    └── git/             # done
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

- `shared` imports nothing project-local.
- `eventbus` imports only `shared`.
- `sessions` imports only `shared` and standard library.
- `files` imports only `shared` and standard library.
- `git` imports only standard library.
- `store` may import `sessions`, `files`, `git`, `shared`.
- `runner` may import `eventbus` contracts, `sessions` parser contracts, `shared`; it must not import `server`.
- `server` composes concrete implementations and owns HTTP wiring.
- root `internal/piweb` must not contain implementation logic.

## Completion phases

### Phase 1 — Sessions package

Goal: move all session parsing and session-file metadata into `internal/piweb/backend/sessions`.

Move candidates:

- `pi_session_message_page.go`
- `pi_session_messages.go`
- `pi_session_summaries.go`
- `pi_sessions.go`
- `session_dirs.go`
- `session_parent.go`
- `session_sources.go`
- `team_sessions.go`
- their focused tests

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
```

Blockers to remove first:

- `slug` / workspace ID helper currently belongs to store utilities; move or duplicate as exported session-safe helper.
- `imageExtension` is shared with runner prompt attachment logic; move to `shared` or a tiny media helper.
- unexported parent/team helpers need exported narrow wrappers, not direct cross-package access.

Success criteria:

- `store` imports `backend/sessions` for all session parsing/loading.
- `runner` imports `backend/sessions` only for parsing tailed JSONL lines.
- no session parser functions remain in `backend` root.

### Phase 2 — Runtime package

Goal: move model/quota/version/update/package status into `internal/piweb/backend/runtime`.

Move candidates:

- `models.go`
- `pi_package_updates.go`
- `pi_rpc_status.go`
- `pi_update.go`
- `pi_version.go`
- `quota_payloads.go`
- `quota_status.go`
- `runtime_status.go`
- their tests

Required API:

```go
type Status struct { ... }
type UpdateRunner interface { ... }
type Updater struct { ... }

type PackageUpdateDetector func(context.Context, string) (PackageUpdateStatus, error)

func WorkspaceStatus(ctx context.Context, root string) (Status, error)
func WorkspaceModelStatus(ctx context.Context, root string) (Status, error)
func WorkspaceQuotaStatus(ctx context.Context, root string) (Status, error)
func DetectPiVersionStatus(ctx context.Context) (shared.PiVersionStatus, error)
func DetectGlobalPackageUpdates(ctx context.Context) (PackageUpdateStatus, error)
func DetectWorkspacePackageUpdates(ctx context.Context, root string) (PackageUpdateStatus, error)
func NewUpdater(runner UpdateRunner) *Updater
```

Blockers to remove first:

- process group helpers are shared with runner/commands/update; move to `backend/process` or keep local copies with build tags.
- runtime auth reads should use `auth.AuthPath` / `auth.ReadAuthFile`, never unexported auth helpers.

Success criteria:

- `server` imports runtime package for version/update/runtime endpoints.
- `backend` root has no `pi_*`, `quota_*`, or `runtime_status` implementation files.

### Phase 3 — Notifications package

Goal: isolate Discord/Telegram side effects under `internal/piweb/backend/notifications`.

Move candidates:

- `discord_notifications.go`
- related tests

Required API:

```go
type SettingsProvider interface {
    WorkspaceSettings(workspaceRoot string) (Settings, error)
}

func ResponseCompleted(ctx Context) error
func ChoiceQuestion(ctx Context) error
```

Blockers to remove first:

- notification code reads session headers and team-child paths directly.
- move those helpers behind `sessions` API first.
- fallback-choice detection currently lives near runner; move to `sessions` or `shared` text helper.

Success criteria:

- `runner` calls notification API through a `Notifier` interface.
- notifications package does not import runner or server.

### Phase 4 — Workspace package

Goal: move clone/shell/settings operations to `internal/piweb/backend/workspace`.

Move candidates:

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
```

Success criteria:

- server workspace handlers import `backend/workspace` for clone/shell/settings.
- root backend package no longer owns workspace operation helpers.

### Phase 5 — Store package

Goal: move state/cache/persistence into `internal/piweb/backend/store`.

Move candidates:

- `store.go`
- `store_mock.go`
- `store_sessions.go`
- `store_utils.go`
- `store_workspace.go`
- `web_db.go`
- their tests

Required API:

```go
type Store struct { ... }

func NewAuto() *Store
func NewWeb(dbPath string) *Store
func NewPi(sessionDir string) (*Store, error)
func NewMock() *Store
```

Dependencies:

- imports `sessions`, `files`, `git`, `shared`.
- does not import `server` or `runner`.

Success criteria:

- `backend/server` depends on store through existing `ServerStore` interface.
- root facade aliases `store.Store` as public `piweb.Store`.

### Phase 6 — Runner package

Goal: move pi process/RPC streaming into `internal/piweb/backend/runner`.

Move candidates:

- `runner.go`
- `runner_events.go`
- `runner_tail.go`
- `agui.go`
- `process_unix.go`
- `process_windows.go`
- related tests

Required API:

```go
type EventSink interface { Publish(sessionID, eventType string, payload any) shared.Event }
type SessionStore interface { ... }
type Notifier interface { ... }

type Runner struct { ... }
func New() *Runner
func StartPrompt(ctx context.Context, deps Deps, req PromptRequest) error
func Steer(sessionID string, text string, images []shared.PromptAttachment) error
func Cancel(sessionID string) bool
func IsRunning(sessionID string) bool
func RunningSessionIDs() map[string]bool
```

Dependencies:

- imports `sessions`, `notifications`, `shared`.
- consumes event sink interface; does not import server.

Success criteria:

- server owns a `runner.Runner` through `ServerRunner` interface.
- backend root has no runner process lifecycle files.

### Phase 7 — Server package

Goal: move HTTP orchestration into `internal/piweb/backend/server`.

Move candidates:

- `server.go`
- `server_session_handlers.go`
- `server_workspace_handlers.go`
- `server_static.go`
- server tests
- `command_cache.go` if it remains server-owned

Required API:

```go
type Config struct { ... }
type Server struct { ... }
func New(config Config, store ServerStore, broker ServerBroker, runner ServerRunner) *Server
```

Success criteria:

- `internal/piweb/backend` root is either removed or becomes package assembly only.
- `internal/piweb/facade.go` exports `NewServer` and public aliases from final packages.
- `go list ./internal/piweb/...` shows cohesive packages with no god implementation package.

## Final verification checklist

Run all checks after every phase:

```bash
go test $(go list ./... | grep -v '/node_modules/')
bun run lint
bun run typecheck
bun run test
bun run build:binary
bun run build-storybook
```

Final audit:

```bash
git status --short
find internal/piweb -maxdepth 3 -type d | sort
go list ./internal/piweb/...
```

Final acceptance:

- root has no implementation files except approved config/metadata.
- `internal/piweb` root has facade only.
- no package exists unless it is imported by another package or directly tested as public surface.
- no duplicate implementation copies.
- no symlink shadow tree.
- no generated folders tracked outside approved embedded assets.
