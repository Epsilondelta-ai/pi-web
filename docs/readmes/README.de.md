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

Der Installer installiert außerdem die vertrauenswürdigen Standard-Plugins: Toast-Benachrichtigungen, Dateibrowser und Git-Viewer. Setze `PI_WEB_INSTALL_DEFAULT_PLUGINS=never`, um sie zu überspringen.

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
- **Plugins (in Entwicklung)**: Lädt vertrauenswürdige lokale/GitHub-JavaScript-Plugins, um UI-Panels hinzuzufügen und pi-web-APIs oder lokale Backend-Skripte aufzurufen.
- **Einzelne ausführbare Datei**: Verteilt den statischen Astro-Build eingebettet in ein Go-Binary mit integrierter Update-Unterstützung.

## Plugins (in Entwicklung)

Plugins sind experimentell und für vertrauenswürdigen lokalen Code gedacht. Die API kann sich noch ändern, bevor sie als stabil gilt.

Installiere Plugins unter **Settings → Plugins** mit einem lokalen Pfad oder GitHub-Wert `owner/repo`. Der Ordner muss `plugin.json` und ein Entry-JavaScript-Modul enthalten.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` ist erforderlich. `backend` ist optional. Beide Pfade müssen innerhalb des Plugin-Ordners bleiben.

```js
export function activate(context) {
  const panel = document.createElement("section");
  panel.dataset.pluginPanel = context.plugin.id;
  panel.textContent = `Hello from ${context.plugin.name}`;
  context.app.querySelector("[data-plugin-sidebar]")?.append(panel);

  return () => {
    panel.remove();
  };
}
```

Das Entry-Modul exportiert `activate(context)` oder `default(context)`. Wenn es eine Funktion oder ein Objekt mit `deactivate()`/`dispose()` zurückgibt, wird es bei reload, disable oder uninstall bereinigt. `deactivate(context)` auf Modulebene wird ebenfalls unterstützt.

Der Plugin-context enthält:

- `context.app`: das `<pi-app>`-Element.
- `context.plugin`: das geparste Manifest.
- `context.api.get(path)` / `context.api.post(path, body)`: pi-web-HTTP-APIs aufrufen.
- `context.backend(method, { workspaceId, data })`: optionales Backend aufrufen; `data` ist das stdin-JSON.
- `context.loadCodeMirrorFileEditor()`: den eingebauten Datei-Editor lazy-loaden.

Optionale Backend-Skripte laufen lokal bei Bedarf. JavaScript nutzt Node; Go wird automatisch gebaut und gecacht. Das Skript erhält `method` und `workspaceRoot`, liest JSON von stdin und muss gültiges JSON auf stdout ausgeben.

```js
const [, , method, workspaceRoot] = process.argv;
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  console.log(JSON.stringify({ method, workspaceRoot, received: JSON.parse(input || "{}") }));
});
```
