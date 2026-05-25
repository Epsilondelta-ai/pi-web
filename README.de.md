<h1 align="center">pi-web</h1>

<div align="center">

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](./docs/assets/pi-web.png)

| Desktop |
| --- |
| ![Workspace-Session-UI](docs/assets/screenshot.png) |

| Tablet | Mobil |
| --- | --- |
| ![Workspace-UI auf dem Tablet](docs/assets/tablet.webp) | ![Dateibaum-UI auf Mobilgeräten](docs/assets/mobile.webp) |

</div>

## Installation

Installiere das neueste GitHub-Release-Binary:

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

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
- **Einzelne ausführbare Datei**: Verteilt den statischen Astro-Build eingebettet in ein Go-Binary mit integrierter Update-Unterstützung.
