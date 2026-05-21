<h1 align="center">pi-web</h1>

<div align="center">

![pi.dev web](./docs/assets/pi-web.png)
<br /><br />
![Workspace session UI](docs/assets/screenshot.png)

</div>

## Installation

Install the latest GitHub release binary:

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

Install from npm:

```bash
npm i -g @epsilondelta-ai/pi-web
```

Update an npm install:

```bash
npm update -g @epsilondelta-ai/pi-web
```

`pi-web update` is reserved for standalone GitHub release installs and will point npm installs back to npm.

Run after installation:

```bash
pi-web
# Listens on 0.0.0.0:8732. Open http://127.0.0.1:8732

pi-web --port 9999
# Open http://127.0.0.1:9999
```

Update the installed single binary:

```bash
pi-web update
```

## Introduction

A web UI for viewing and controlling the local `pi` coding agent in your browser.
It bundles an Astro-based frontend and a Go backend into a single executable, so you can run the workspace/session UI in a local browser without configuring a separate server.

## Features

- **Workspace management**: Open local folders, view recent workspaces, and open workspaces after cloning Git repositories.
- **Session UI**: Browse existing pi sessions, create new sessions, and stream prompts/responses in real time.
- **File browsing and preview**: Browse the workspace file tree, read files, edit them, and save changes from the UI.
- **Local command execution**: Run shell commands in the selected workspace.
- **Single executable**: Distribute the Astro static build embedded in a Go binary.

## Development

- Repository layout: [`docs/repository-structure.md`](docs/repository-structure.md)
- Repository audit: [`docs/repository-audit.md`](docs/repository-audit.md)
- Maintenance tasks: [`docs/tasks.md`](docs/tasks.md)
- Durable implementation plans: [`docs/plans/`](docs/plans/)
