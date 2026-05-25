<h1 align="center">pi-web</h1>

<div align="center">

[English](README.md) | [한국어](docs/readmes/README.ko.md) | [简体中文](docs/readmes/README.zh-CN.md) | [日本語](docs/readmes/README.ja.md) | [Español](docs/readmes/README.es.md) | [Português (BR)](docs/readmes/README.pt-BR.md) | [Français](docs/readmes/README.fr.md) | [Русский](docs/readmes/README.ru.md) | [Deutsch](docs/readmes/README.de.md)

![pi.dev web](./docs/assets/pi-web.png)

| Desktop |
| --- |
| ![Workspace session UI](docs/assets/screenshot.png) |

| Tablet | Mobile |
| --- | --- |
| ![Tablet workspace UI](docs/assets/tablet.webp) | ![Mobile file tree UI](docs/assets/mobile.webp) |

</div>

## Installation

Install the latest GitHub release binary:

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

Update the installed binary:

```bash
pi-web update
```

Run after installation:

```bash
pi-web
# Listens on 0.0.0.0:8732. Open http://127.0.0.1:8732

pi-web --port 9999
# Open http://127.0.0.1:9999
```

## Introduction

A web UI for viewing and controlling the local `pi` coding agent in your browser.
It bundles an Astro-based frontend and a Go backend into a single executable, so you can run the workspace/session UI in a local browser without configuring a separate server.

## Features

- **Workspace management**: Open local folders, switch recent workspaces, delete saved workspaces, and clone Git
  repositories before opening them.
- **Session UI**: Browse workspace sessions, create/rename/delete sessions, resume previous conversations, and stream
  prompts/responses in real time.
- **Prompt controls**: Send prompts with multiple attachments, keep per-session drafts, cancel or steer active runs, and
  answer pi fallback choice prompts inline.
- **Transcript rendering**: Render markdown, syntax-highlighted code, tool output, streamed design decks, and long
  transcripts with virtualization.
- **File browsing and editing**: Browse the workspace file tree with Material Icon Theme icons, search files, preview
  supported formats, create/rename/delete/upload files, edit text files, and save changes from the UI.
- **Git insight**: View workspace Git status, file decorations, commit history, and individual commit details.
- **Local command execution**: Run shell commands in the selected workspace and inspect command history/results.
- **Settings and auth**: Manage project/global pi settings, API keys, OAuth login for Claude/Codex/Copilot
  subscriptions, runtime model/thinking settings, and quota/status checks.
- **Voice and notifications**: Read responses aloud, use browser or local Whisper speech transcription, and configure
  Discord/Telegram completion notifications.
- **Internationalized UI**: Switch the browser UI across English, Korean, Chinese, Japanese, Spanish, Portuguese,
  French, Russian, and German.
- **AG-UI bridge**: Expose session runs through an AG-UI-compatible SSE endpoint for client integrations.
- **Single executable**: Distribute the Astro static build embedded in a Go binary with built-in update support.
