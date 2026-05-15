# Pi Web UI — Technology Context

_Last updated: 2026-05-15_

## Current Stack

| Area | Technology | Version / State |
|---|---|---|
| Frontend framework | Astro | `6.3.2` from lockfile |
| Frontend language | TypeScript | `6.0.3` from lockfile |
| Terminal renderer | `@xterm/xterm`, `@xterm/addon-fit` | `6.0.0`, `0.11.0` from package.json |
| Type checking | `@astrojs/check` | `0.9.9` from lockfile |
| Formatting | Prettier | `3.8.3` |
| Astro formatting | `prettier-plugin-astro` | `0.14.1` |
| Styling | Plain CSS + custom tokens | `src/styles/*.css` |
| Runtime output | Static frontend served by Go | `astro.config.mjs` `output: "static"` |
| Backend | Go | `go 1.23` module implemented |
| Backend HTTP | Go `net/http` | local server + routes |
| WebSocket | `github.com/gorilla/websocket` | `v1.5.3` |
| PTY | `github.com/creack/pty` | `v1.1.24` |
| Tmux persistence | system `tmux` binary | runtime dependency when tmux mode enabled |
| Database | none | DB docs placeholders exist only |

## Package Scripts

```bash
npm run dev            # Astro dev server
npm run check          # astro check
npm run build          # astro check && astro build
npm run smoke          # text-based build artifact smoke checks
npm run test:frontend  # source-level terminal/tmux frontend contract checks
npm run format         # Prettier for Astro/CSS/TS/scripts/root config files
npm run preview        # Astro preview
```

Backend commands:

```bash
go test ./...
go run ./cmd/pi-web-ui
```

## Frontend Implementation Notes

- Astro renders static HTML from `.astro` components.
- Browser shell behavior lives in `src/scripts/app-shell.ts` and uses direct DOM APIs.
- Live terminal behavior lives in `src/scripts/terminal-client.ts`.
- Terminal bytes are rendered through xterm.js via `term.write(message.data)`.
- No React/Vue/Svelte island framework is installed.
- CSS is project-local and token-driven; Tailwind is not installed.
- External font import is intentionally avoided. The font stack starts with `JetBrains Mono` but falls back to system monospace fonts.
- Tmux UI contract uses DOM markers for detached state, attach action, kill action, and managed session list.

## Backend Implementation Notes

- `cmd/pi-web-ui` starts local HTTP server with config from environment variables.
- `internal/config` validates local host binding, exact origins, workspace roots, command allowlist, tmux settings, and tmux binary availability.
- `internal/server` wires static serving, health route, terminal WebSocket route, and tmux REST helpers.
- `internal/terminal` contains:
  - direct PTY runner.
  - mode-aware WebSocket handler.
  - managed tmux runner.
  - lifecycle events and state vocabulary.
- Direct PTY mode keeps close-on-disconnect behavior.
- Managed tmux mode detaches on browser disconnect and preserves child process lifetime.
- Tmux commands are executed as argument vectors, not shell-concatenated strings.
- Managed tmux operations are limited to start, attach, list, and kill.

## Local Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PI_WEB_HOST` | `127.0.0.1` | Local bind host |
| `PI_WEB_PORT` | `8787` | HTTP/WebSocket port |
| `PI_WEB_ORIGIN` | `http://127.0.0.1:8787` | Served UI origin |
| `PI_WEB_EXTRA_ORIGINS` | empty | Comma-separated explicit dev origins |
| `PI_WEB_WORKSPACE_ROOTS` | current working directory | Comma-separated allowed workspace roots |
| `PI_WEB_COMMAND` | `pi` | Allowed command/path to run in terminal |
| `PI_WEB_TMUX_ENABLED` | `true` | Enable managed tmux mode |
| `PI_WEB_TMUX_BINARY` | `tmux` | tmux binary path or lookup name |
| `PI_WEB_TMUX_PREFIX` | `piweb-` | Managed session name prefix |

## Design Tokens

Primary tokens live in `src/styles/tokens.css`:

- Background: `#000000`, `#0a0a0a`, `#111111`, `#1a1a1a`.
- Foreground: `#f5f5f5`, `#d4d4d4`, muted grays.
- Accent: ANSI green `#00ff88`.
- Semantic UI colors: tool call amber, user message blue, thinking pink, danger red, info cyan.
- Spacing scale: 4px-based CSS custom properties.
- Modal shadow token: `--shadow-modal`.

Imported design token artifact also exists at `.moai/design/tokens.json`.

## Verification

Current quality gate:

1. `go test ./...` for backend unit and route tests.
2. `npm run check` for Astro/TypeScript diagnostics.
3. `npm run build` for static build.
4. `npm run smoke` for structural smoke checks against `dist/index.html` and source files.
5. `npm run test:frontend` for terminal/tmux frontend contract checks.
6. `npm run format` for formatting.

Current backend tests cover:

- config defaults, env parsing, origin/workspace/command validation, tmux config validation.
- terminal protocol, PTY runner, lifecycle events.
- tmux runner sanitization, managed prefix enforcement, start/attach/kill/list behavior, argument-vector safety.
- handler mode selection, direct PTY preservation, tmux detach, same-session attach, validation rejection.
- server route behavior for tmux list/kill.

Current smoke/frontend checks cover:

- document language and viewport fit.
- phone frame and iOS status bar presence.
- home/session/terminal screens.
- prompt textarea and keypad.
- xterm mount and terminal status markers.
- tmux session list, detached state, attach action, kill action markers.
- workspace bottom sheet.
- approval modal with diff preview.
- settings modal.
- ARIA modal semantics.
- focus trap and inert background logic.
- external Google Fonts absence.
- terminal output uses xterm path without `innerHTML`.
- frontend attach strips workspace identity without hardcoded managed prefix.

## Security Considerations

Current frontend:

- Does not inject raw Claude Design HTML.
- Terminal output is inserted through xterm.js, not DOM `innerHTML`.
- Shell UI dynamic labels use safe DOM text paths.
- Approval UI is currently UI-level only and does not execute commands.

Current backend:

- Binds to `127.0.0.1` by default.
- Accepts exact same-origin WebSocket/API requests by default.
- Does not allow broad `http://localhost:*` origin wildcards.
- Canonicalizes workspace paths before allowlist comparison.
- Rejects command overrides; users cannot choose arbitrary commands.
- Does not log raw terminal input/output streams by default.
- Validates tmux binary before tmux mode execution.
- Rejects non-managed tmux sessions and unsanitized identities.
- Emits non-secret lifecycle events and reason codes for tmux failures.

Future backend must enforce before network exposure:

- authentication and authorization.
- stronger approval execution policy.
- audit/log retention policy without raw secret leakage.

## Terminal Rendering

Implemented local flow:

```text
xterm.js frontend
  <-> WebSocket /api/terminals/{workspaceId}/sessions/{sessionId}
Go backend terminal handler
  <-> PTY runner or managed tmux runner
pi process
```

Important terminal requirements:

- `TERM=xterm-256color`.
- PTY cols/rows synchronized with xterm fit addon.
- raw keyboard input forwarded to PTY.
- stdout/stderr handled through one PTY stream.
- terminal output never injected as HTML.

## CI/CD Status

- No GitHub Actions workflow is present in the current repo.
- Recommended CI gate: install npm dependencies, run `go test ./...`, `npm run build`, `npm run smoke`, `npm run test:frontend`.

## Operational Status

- Current artifact is a local Astro + Go app.
- `dist/`, `.astro/`, `node_modules/` are ignored build/local artifacts.
- Production deployment target has not been selected.
- Managed tmux mode requires system `tmux` when enabled.

## Known Dependency Risk

`npm audit --audit-level=high` previously reported no high/critical vulnerabilities, but moderate vulnerabilities exist through `@astrojs/check` → `yaml-language-server` → `yaml`. Force-fixing would downgrade/break `@astrojs/check`, so it should be revisited when upstream releases a compatible fix.
