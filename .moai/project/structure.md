# Pi Web UI — Structure Context

_Last updated: 2026-05-15_

## Architecture Summary

현재 저장소는 Astro static frontend와 Go backend가 함께 있는 local-first web app 구조다. 애플리케이션은 `cmd/pi-web-ui`에서 HTTP server를 실행하고, `dist/` 정적 frontend를 서빙하며, `/api/terminals/...` WebSocket과 `/api/tmux/...` REST helper를 제공한다. Frontend는 `src/pages/index.astro`에서 `BaseLayout`과 `AppShell`을 조합하고, `src/scripts/terminal-client.ts`가 xterm.js와 backend terminal stream을 연결한다.

## Top-Level Directories

| Path | Purpose | Current State |
|---|---|---|
| `cmd/pi-web-ui/` | Go HTTP server entrypoint | 구현됨 |
| `internal/config/` | local config, origin/workspace/command/tmux validation | 구현됨 |
| `internal/server/` | routing, static file serving, tmux REST handlers | 구현됨 |
| `internal/terminal/` | PTY runner, WebSocket handler, tmux runner, lifecycle events | 구현됨 |
| `src/` | Astro frontend source | 구현됨 |
| `src/components/` | UI components | `AppShell.astro` 중심 |
| `src/layouts/` | HTML document/layout wrapper | `BaseLayout.astro` |
| `src/pages/` | Astro routes | `/` 단일 page |
| `src/scripts/` | Browser TypeScript behavior | app shell + terminal client |
| `src/styles/` | Global CSS, tokens, app shell CSS | 구현됨 |
| `public/` | Static assets | favicon, wordmark |
| `scripts/` | Local verification scripts | smoke check, frontend contract test |
| `.moai/design/` | Design artifacts and tokens | 존재, 일부 placeholder 포함 |
| `.moai/project/brand/` | Brand docs | 기존 파일 유지 |
| `.moai/project/db/` | DB docs placeholder | database 미구현 상태 |

## Backend Module Map

### `cmd/pi-web-ui/main.go`

- HTTP server entrypoint.
- `config.LoadFromEnv()`로 local config를 읽는다.
- `server.New()`에 `terminal.PTYRunner{}`와 event sink를 연결한다.
- lifecycle event 이름과 non-secret code만 로그로 남긴다.

### `internal/config/config.go`

- host/port/origin/workspace/command config owner.
- `PI_WEB_TMUX_ENABLED`, `PI_WEB_TMUX_BINARY`, `PI_WEB_TMUX_PREFIX`를 지원한다.
- localhost binding, exact origin, workspace canonicalization, command allowlist, tmux binary availability를 검증한다.

### `internal/server/server.go`

- `http.ServeMux` 구성 owner.
- 주요 route:
  - `/api/terminals/{workspaceId}/sessions/{sessionId}`: terminal WebSocket handler.
  - `GET /api/tmux/sessions`: managed tmux session list.
  - `POST /api/tmux/sessions/{managedName}/kill`: managed tmux session kill.
  - `/api/health`: health JSON.
  - `/`: `dist/` static file server.
- tmux REST route는 origin/workspace/command/tmux policy를 검증한 뒤 실행한다.

### `internal/terminal/runner.go`

- direct PTY runner owner.
- SPEC-TERM-001 close-on-disconnect lifecycle 기반이다.

### `internal/terminal/handler.go`

- terminal WebSocket lifecycle owner.
- mode selection(`pty`/`tmux`), start/attach action, resize/input message, disconnect policy를 처리한다.
- direct PTY disconnect는 `terminal.closed`; managed tmux disconnect는 `terminal.detached`다.

### `internal/terminal/tmux_runner.go`

- managed tmux runner owner.
- start/attach/kill/list operation을 제공한다.
- managed prefix, bounded alphanumeric-hyphen identity, argument-vector tmux command construction을 강제한다.
- same-session attach는 single-attachment replacement 정책이다.

### `internal/terminal/events.go`

- terminal event vocabulary owner.
- direct PTY: `terminal.started`, `terminal.resized`, `terminal.closed`, `terminal.rejected`, `terminal.error`.
- managed tmux: `terminal.started`, `terminal.resized`, `terminal.detached`, `terminal.killed`, `terminal.stale`, `terminal.rejected`, `terminal.error`.
- tmux lifecycle state: `live`, `detached`, `killed`, `stale`, `error`.

## Frontend Module Map

### `src/pages/index.astro`

- App entry route.
- `BaseLayout` 안에 `AppShell`을 렌더링한다.
- `src/styles/app-shell.css`를 page-level로 import한다.

### `src/layouts/BaseLayout.astro`

- HTML document shell.
- `lang="en"`, `viewport-fit=cover`, favicon, theme color, meta description을 설정한다.
- skip link를 제공해 main content로 이동 가능하게 한다.

### `src/components/AppShell.astro`

- 핵심 UI component.
- phone-frame 안에 iOS status bar, app header, screen stack, tab bar, prompt bar, dialogs를 구성한다.
- terminal screen에 xterm mount, terminal status, tmux session list, detached state, attach/kill action marker가 있다.
- overlay/dialog:
  - new workspace bottom sheet.
  - approval diff modal.
  - model/settings dialog.

### `src/scripts/app-shell.ts`

- 단일 event delegation으로 app shell interaction을 처리한다.
- 주요 책임:
  - screen 전환(`home`, `sessions`, `terminal`).
  - workspace/session active state 및 ARIA state 업데이트.
  - prompt submit 시 `pi-terminal:send` event dispatch.
  - tmux attach/kill button event dispatch.
  - approval/settings/workspace dialogs 열기/닫기.
  - modal focus trap, focus restore, background inert 처리.

### `src/scripts/terminal-client.ts`

- live terminal client owner.
- xterm.js terminal과 FitAddon을 초기화한다.
- backend WebSocket에 input/resize를 전달하고 output을 `term.write()`로 렌더링한다.
- managed tmux session list를 조회하고 attach/kill 흐름을 처리한다.
- `terminal.detached`는 error가 아니라 attach 가능한 persistent state로 표시한다.

### `src/styles/tokens.css`

- black terminal surface, ANSI green accent, foreground, borders, spacing, typography token 정의.
- Google Fonts import 없이 local/system monospace stack을 사용한다.

### `src/styles/global.css`

- global reset, base typography, body background, focus visible, skip link, button/input font inheritance를 정의한다.

### `src/styles/app-shell.css`

- phone-first PiFrame layout과 app shell 세부 스타일.
- 375×812 frame, safe-area padding, touch target 44px, small landscape 대응, overlay/dialog 스타일을 포함한다.

### `scripts/smoke-check.mjs`

- `dist/index.html`과 source text를 검사하는 smoke verification.
- phone frame, screens, dialogs, prompt textarea, keypad, xterm markers, tmux markers, focus trap, external font absence 등을 확인한다.

### `scripts/frontend-contract-test.mjs`

- source-level frontend contract verification.
- detached state DOM marker, attach/kill dispatch, reconnect behavior, xterm-only output path, workspace identity attach contract를 확인한다.

## Runtime Data Flow

```text
Browser AppShell
  -> terminal-client.ts
  -> WebSocket /api/terminals/{workspaceId}/sessions/{sessionId}
  -> Go backend terminal handler
  -> direct PTY runner or managed tmux runner
  -> pi command
```

Managed tmux session management:

```text
Browser AppShell
  -> GET /api/tmux/sessions
  -> POST /api/tmux/sessions/{managedName}/kill
  -> Go backend tmux REST handlers
  -> TmuxRunner list/kill
```

## Integration Boundaries

- `AppShell.astro`는 UI structure owner다.
- `app-shell.ts`는 shell interaction과 custom event dispatch owner다.
- `terminal-client.ts`는 xterm/WebSocket/tmux client contract owner다.
- `internal/terminal/handler.go`는 terminal WebSocket lifecycle owner다.
- `internal/terminal/tmux_runner.go`는 tmux process boundary owner다.
- `internal/config/config.go`는 local-only security config owner다.
- `tokens.css`는 visual contract owner다. 디자인 변경은 token 중심으로 반영한다.

## Non-Functional Requirements

- Accessibility: dialogs use `role="dialog"`, `aria-modal`, focus trap, focus restore, background inert.
- Responsive: mobile-first 375px frame; desktop에서는 centered phone frame.
- Security: terminal output은 raw HTML로 주입하지 않는다. xterm.js `term.write()` 경로만 사용한다.
- Local-only: backend는 기본적으로 `127.0.0.1`에 bind한다.
- Tmux safety: managed prefix와 sanitized identity만 operation 대상이다.
- Maintainability: frontend shell, terminal client, backend terminal handler, tmux runner 책임을 분리한다.

## Known Structural Gaps

- Authentication package 없음.
- Database-backed persistence 없음.
- Multi-user collaboration 구조 없음.
- Approval/tool-call backend protocol 미구현.
- GitHub Actions workflow 없음.
