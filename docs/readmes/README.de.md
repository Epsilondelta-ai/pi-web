<h1 align="center">pi-web</h1>

<div align="center">

[English](../../README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](../assets/pi-web.png)

| Desktop |
| --- |
| ![Workspace-Session-UI](../assets/screenshot.png) |

| Tablet | Mobil |
| --- | --- |
| ![Workspace-UI auf dem Tablet](../assets/tablet.webp) | ![Dateibaum-UI auf Mobilgeräten](../assets/mobile.webp) |

</div>

## Installation

Installiere das neueste GitHub-Release-Binary:

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

Der Installer und `pi-web update` installieren die vertrauenswürdigen Standard-Plugins, wenn lokal keine Plugins installiert sind: Toast-Benachrichtigungen, Dateibrowser, Git-Viewer, Sidebar, Chat-Composer, Discord-Benachrichtigungen und Telegram-Benachrichtigungen. Setze `PI_WEB_INSTALL_DEFAULT_PLUGINS=never`, um sie zu überspringen, oder `always`, um sie neu zu installieren.

Aktualisiere das installierte Binary:

```bash
pi-web update
```

Nach der Installation ausführen:

```bash
pi-web
# Lauscht auf 0.0.0.0:8732. Öffne http://127.0.0.1:8732

pi-web --port 9999
# Öffne http://127.0.0.1:9999
```

## Einführung

Eine Web-UI, um den lokalen `pi` Coding-Agent im Browser anzusehen und zu steuern.
Sie bündelt ein Astro-basiertes Frontend und ein Go-Backend in einer einzelnen ausführbaren Datei, sodass du die Workspace/Session-UI in einem lokalen Browser ohne separaten Server starten kannst.

## Funktionen

- **Workspace-Verwaltung**: Öffne lokale Ordner, wechsle zwischen zuletzt verwendeten Workspaces, lösche gespeicherte Workspaces und klone Git-Repositories vor dem Öffnen.
- **Session-UI**: Durchsuche Workspace-Sessions, erstelle/benenne/lösche Sessions, setze frühere Unterhaltungen fort und streame Prompts/Antworten in Echtzeit.
- **Prompt-Steuerung**: Sende Prompts mit mehreren Anhängen, behalte Entwürfe pro Session, brich aktive Läufe ab oder steer sie und beantworte pi fallback choice Prompts inline.
- **Transcript-Rendering**: Rendere Markdown, syntaxhervorgehobenen Code, Tool-Ausgaben, gestreamte Design Decks und lange Transcripts mit Virtualisierung.
- **Dateien durchsuchen und bearbeiten**: Durchsuche den Workspace-Dateibaum mit Material Icon Theme Icons, suche Dateien, zeige unterstützte Formate in der Vorschau, erstelle/benenne/lösche/lade Dateien hoch, bearbeite Textdateien und speichere Änderungen in der UI.
- **Git-Einblick**: Sieh Workspace-Git-Status, Dateidekorationen, Commit-Historie und Details einzelner Commits.
- **Lokale Befehlsausführung**: Führe Shell-Befehle im ausgewählten Workspace aus und prüfe Befehlshistorie/Ergebnisse.
- **Einstellungen und Auth**: Verwalte projektweite/globale pi-Einstellungen, API-Keys, OAuth-Login für Claude/Codex/Copilot-Abos, Runtime-Modell/Thinking-Einstellungen und Quota/Status-Prüfungen.
- **Sprache und Benachrichtigungen**: Lies Antworten vor, nutze Browser- oder lokale Whisper-Sprachtranskription und konfiguriere Discord/Telegram-Fertigmeldungen.
- **Internationalisierte UI**: Wechsle die Browser-UI zwischen Englisch, Koreanisch, Chinesisch, Japanisch, Spanisch, Portugiesisch, Französisch, Russisch und Deutsch.
- **AG-UI-Bridge**: Stellt Session-Läufe über einen AG-UI-kompatiblen SSE-Endpunkt für Client-Integrationen bereit.
- **Plugins (in development)**: Load trusted local/GitHub JavaScript plugins that extend UI through stable DOM hooks
  and share state through `piWeb` RxJS subjects.
- **Einzelne ausführbare Datei**: Verteilt den statischen Astro-Build eingebettet in ein Go-Binary mit integrierter Update-Unterstützung.


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

- Shared Subject registry: `piWeb.subject(...)`, `piWeb.behaviorSubject(...)`, `piWeb.replaySubject(...)`,
  `piWeb.asyncSubject(...)`.
- Channel names: `core.*`, `chat.*`, `session.*`, `shortcut.*`, `toast.*`, and `plugin.<pluginId>.*`.
- DOM hooks: `[data-plugin-toolbar]`, `[data-plugin-settings-root]`, `.app-body[data-view="workspace"]`,
  `.main[data-main]`, and `[data-plugin-sidebar]`.

See [Plugin development](../plugins/README.md) for the plugin standard.
