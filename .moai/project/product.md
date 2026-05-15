# Pi Web UI — Product Context

_Last updated: 2026-05-15_

## Mission

Pi Web UI는 로컬에서 동작하는 pi coding agent를 브라우저에서 제어하기 위한 웹 인터페이스다. 터미널 중심의 agent 경험을 모바일/웹 친화적인 shell로 옮겨 workspace, session, prompt, tool 실행, approval 흐름을 한 화면에서 다룰 수 있게 한다.

## Vision

개발자는 터미널을 직접 열지 않아도 브라우저에서 pi agent의 현재 상태를 보고, 명령을 입력하고, 위험한 작업을 승인하거나 거절할 수 있다. Go backend가 로컬 PTY와 tmux-backed session을 관리하고, Astro frontend가 xterm.js로 terminal stream을 안전하게 렌더링한다.

## Current Product State

- Astro 기반 static frontend shell 구현 완료.
- Go backend 구현 완료: local HTTP server, terminal WebSocket, PTY runner, tmux-backed persistent session 관리.
- phone-first 375×812 PiFrame/iOS-style shell이 중심 UI다.
- workspace home, sessions, terminal, prompt bar, keypad, approval modal, settings overlay가 존재한다.
- terminal 화면은 `@xterm/xterm` + `@xterm/addon-fit`으로 렌더링한다.
- direct PTY mode는 WebSocket disconnect 시 process를 종료한다.
- managed tmux mode는 browser disconnect 후에도 session을 유지하며 attach/list/kill 흐름을 제공한다.
- authentication, database persistence, multi-user collaboration은 아직 구현되지 않았다.
- 현재 UI와 terminal stream은 raw HTML injection 없이 Astro component, TypeScript event delegation, xterm.js write path로 동작한다.

## Target Users

### 1. Solo Developer

- 로컬 프로젝트 여러 개에서 pi agent를 실행한다.
- terminal output, tool calls, approval prompts를 빠르게 보고 제어하고 싶다.
- 최소한의 setup으로 localhost 웹 UI를 원한다.
- browser tab을 닫거나 네트워크가 끊겨도 tmux-backed session을 다시 attach하고 싶다.

### 2. Agent Workflow Power User

- 여러 workspace/session을 오가며 계획, 실행, 검증 흐름을 관리한다.
- model, approval mode, prompt history, terminal state를 명확히 보고 싶다.
- 장시간 agent workflow가 browser lifecycle에 묶이지 않기를 원한다.
- 실수로 destructive action을 승인하지 않도록 안전한 confirmation UI가 필요하다.

### 3. Future Team Operator

- 한 명 이상의 개발자가 agent session을 관찰하거나 위임하는 사용 시나리오를 가진다.
- session 상태, logs, approvals, audit trail이 추적 가능해야 한다.

## Top Problems

1. **터미널 UX의 웹 이전**
   pi 실행 화면은 ANSI/TUI/keyboard input이 포함될 수 있어 xterm.js 기반 terminal renderer와 PTY/WebSocket bridge가 필요하다.

2. **세션 수명과 브라우저 수명 분리**
   장시간 agent 작업은 browser disconnect와 독립적으로 지속되어야 한다. managed tmux mode가 이 문제를 해결한다.

3. **안전한 tool approval**
   local file write, shell command, destructive action을 웹에서 다룰 때 명확한 diff preview와 승인 흐름이 필요하다.

4. **workspace/session 맥락 관리**
   여러 repo와 session을 오가면 어떤 agent가 어디에서 무엇을 하는지 놓치기 쉽다.

## Product Principles

- **Terminal-first**: 실제 pi 터미널 경험을 왜곡하지 않는다.
- **Safety-first**: tool 실행과 파일 변경은 명시적 approval 흐름을 거친다.
- **Local-first**: 초기 목표는 localhost 환경에서 안전하게 동작하는 agent control surface다.
- **Persistent when requested**: tmux mode는 browser lifecycle과 session lifecycle을 분리한다.
- **Minimal shell**: backend와 frontend contract를 작게 유지한다.
- **Accessible controls**: touch target, focus trap, ARIA state를 유지한다.

## Success Metrics

- 사용자가 workspace를 선택하고 session을 전환하는 흐름이 명확하다.
- prompt 입력과 approval modal이 keyboard/touch 모두에서 동작한다.
- terminal output은 xterm.js로 렌더링되고 raw HTML로 주입되지 않는다.
- direct PTY mode와 managed tmux mode의 lifecycle 차이가 UI에 명확히 드러난다.
- managed tmux session은 detach 후 attach/list/kill action으로 제어된다.
- `go test ./...`, `npm run build`, `npm run smoke`, `npm run test:frontend`가 기본 품질 게이트로 통과한다.

## Near-Term Roadmap

1. approval/tool-call event protocol 정의 및 backend 연동.
2. workspace/session API contract 확장.
3. session 상태 저장 범위 결정: tmux runtime state와 database persistence 경계 정리.
4. frontend session list와 backend session metadata 연결 강화.
5. CI gate 추가: Go test, Astro build, smoke, frontend contract.

## Out of Scope for Current State

- 인증/권한 시스템.
- multi-user collaboration.
- 원격 서버 접속.
- database-backed persistence.
- arbitrary tmux console access.
- terminal replay 또는 audit history recording.
