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

The installer and `pi-web update` install the default trusted plugins when no local plugins are installed: toast notifications, file browser, Git viewer, sidebar, chat composer, Discord notifications, and Telegram notifications. Set `PI_WEB_INSTALL_DEFAULT_PLUGINS=never` to skip them or `always` to reinstall them.

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
- **Plugins (in development)**: Load trusted local/GitHub JavaScript plugins that extend UI through stable DOM hooks
  and share state through `piWeb` RxJS subjects.
- **Single executable**: Distribute the Astro static build embedded in a Go binary with built-in update support.

## Plugins (in development)

Plugins are trusted local code. pi-web core stays small: it loads plugins, exposes the `piWeb` shared RxJS Subject
registry, and documents stable names for cross-plugin state and DOM extension points.

Install plugins from **Settings → Plugins** with either a local folder path or a GitHub `owner/repo` value. A plugin folder
must contain `plugin.json` and the JavaScript file named by `entry`.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js"
}
```

```js
export function activate() {
  const panel = document.createElement("section");
  panel.textContent = "Hello from hello-panel";
  document.querySelector("[data-main]")?.append(panel);

  return () => panel.remove();
}
```

Core plugin standards:

- Current version: `piWeb.version`.
- Shared Subject registry: `piWeb.subject(...)`, `piWeb.behaviorSubject(...)`, `piWeb.replaySubject(...)`,
  `piWeb.asyncSubject(...)`.
- Channel names: `core.*`, `chat.*`, `session.*`, `shortcut.*`, `toast.*`, and `plugin.<pluginId>.*`.
- DOM hooks: `[data-plugin-toolbar]`, `[data-plugin-settings-root]`, and `.main[data-main]`.

See [Plugin development](docs/plugins/README.md) for the plugin standard.
