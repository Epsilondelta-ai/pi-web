# Backend Tasks

## Direction

Build a local-only Go backend for `pi-web-ui`. The backend is a bridge between the Astro UI and local `pi` workspaces/sessions. Realtime updates use SSE. Client commands use REST POST endpoints.

## Architecture

- Language: Go
- Server: `net/http`
- Default bind: `127.0.0.1:8732`
- API prefix: `/api`
- Realtime: Server-Sent Events via `EventSource`
- Client-to-server commands: REST JSON POST
- First milestone uses in-memory mock data before wiring real `pi` internals

## API Contract

### Health

- `GET /api/health`

### Workspaces

- `GET /api/workspaces`
- `POST /api/workspaces/open`
- `GET /api/workspaces/{workspaceId}/files`
- `GET /api/workspaces/{workspaceId}/git/status`

### Sessions

- `GET /api/workspaces/{workspaceId}/sessions`
- `GET /api/sessions/{sessionId}`
- `POST /api/sessions/{sessionId}/prompt`
- `GET /api/sessions/{sessionId}/events`

## SSE Event Types

- `session.message`
- `session.status`
- `tool.started`
- `tool.output`
- `tool.finished`
- `workspace.files.changed`
- `error`
- `heartbeat`

SSE wire format:

```txt
event: tool.output
id: 123
data: {"sessionId":"...","payload":{}}

```

## Tasks

### 1. Server skeleton

- Create Go backend entrypoint.
- Add local config: host, port, allowed origins.
- Add graceful shutdown.
- Add request logging middleware.
- Add JSON response/error helpers.

### 2. SSE broker

- Implement session-scoped subscriptions.
- Use `r.Context().Done()` to unregister disconnected clients.
- Send headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- Flush after headers and every event.
- Add heartbeat every 15 seconds.
- Add monotonically increasing event ids.
- Define slow-client policy with bounded channel buffers.

### 3. Mock domain store

- Port current frontend fixture shape into Go structs.
- Provide workspaces, sessions, file tree, conversation messages.
- Keep IDs stable so frontend stories and API-backed UI match.

### 4. Mock API endpoints

- Implement health/workspace/session/file endpoints.
- Implement prompt POST endpoint.
- On prompt POST, append user message and emit fake pi/tool events over SSE.

### 5. Frontend API adapter

- Add frontend API module.
- Replace direct fixture reads step-by-step.
- Add `EventSource` session stream adapter.
- Handle reconnect and `Last-Event-ID` later if needed.

### 6. Real pi bridge

- Discover local workspaces.
- Read session metadata/logs.
- Execute prompt through `pi` process or internal session runner.
- Normalize stdout/tool activity into SSE events.
- Add cancellation support.

### 7. Local safety

- Bind to localhost by default.
- Add CORS allowlist for Astro dev, Storybook, and built UI origins.
- Validate workspace paths.
- Prevent path traversal outside workspace root.
- Add secret redaction before emitting tool output.

### 8. Tests

- Unit-test SSE event encoding.
- Unit-test broker subscribe/unsubscribe/fanout.
- Unit-test path validation.
- Integration-test `POST /prompt` to ordered SSE events.
- Frontend-test EventSource adapter with mocked stream.

## First implementation milestone

Implement tasks 1 through 4 only:

1. Go server skeleton
2. SSE broker
3. Mock domain store
4. Mock API endpoints with fake prompt streaming

Do not wire real `pi` execution until the REST/SSE contract is stable.
