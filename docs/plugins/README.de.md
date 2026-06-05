# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Plugins sind experimentell und für vertrauenswürdigen lokalen Code gedacht. Die API kann sich vor der Stabilisierung
ändern.

## Ordnerstruktur

Ein Plugin-Ordner muss `plugin.json` und ein Entry-Modul enthalten. TypeScript-Plugins müssen in die von `entry`
benannte JavaScript-Datei gebündelt oder kompiliert werden.

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

## Entry-Modul

Das Entry-Modul kann `activate(context)` oder `default(context)` exportieren. Wenn es eine Funktion oder ein Objekt mit
`deactivate()` oder `dispose()` zurückgibt, kann pi-web das Plugin bei reload, disable oder uninstall bereinigen. Ein
Modul-Export `deactivate(context)` wird ebenfalls unterstützt.

```ts
type PluginContext = {
  app: HTMLElement;
  plugin: { id: string; name?: string };
};

export function activate(context: PluginContext): () => void {
  const panel: HTMLElement = document.createElement("section");
  panel.dataset.pluginPanel = context.plugin.id;
  panel.textContent = `Hello from ${context.plugin.name ?? context.plugin.id}`;
  context.app.querySelector("[data-plugin-sidebar]")?.append(panel);

  return (): void => {
    panel.remove();
  };
}
```

## Plugin context

- `context.app`: das `<pi-app>`-Element.
- `context.plugin`: das geparste Manifest.
- `context.rxjs`: der von pi-web core bereitgestellte RxJS-Namespace.
- `context.api.get(path)` / `context.api.post(path, body)`: ruft pi-web HTTP APIs auf.
- `context.backend(method, { workspaceId, data })`: ruft das optionale backend-Skript auf. `workspaceId` ist optional;
  `data` wird zum backend stdin JSON.
- `context.mount.chat(element)` / `context.mount.composer(element)`: mountet chat- oder composer-Surfaces.
- `context.chat`: hängt Transcript-Nachrichten an, streamt, rendert, finalisiert und scrollt.
- `context.composer`: liest, setzt, sendet, bricht ab, hängt an oder leert die Prompt-Eingabe.
- `context.session`: prüft die aktive Session, sendet Prompts, steuert, bricht ab oder abonniert Session-Events.
- `context.files`: sucht oder liest Workspace-Dateien.
- `context.shell`: führt Workspace-Shell-Befehle aus.

## Core RxJS für Plugins

pi-web installiert RxJS im core und stellt es als `context.rxjs` bereit. Verwende dies statt einer separat gebündelten
RxJS-Kopie, wenn Plugins kompatible Observables, Subjects oder Subscriptions benötigen.

```ts
import type { BehaviorSubject, Subscription } from "rxjs";

type PluginContext = {
  rxjs: typeof import("rxjs");
};

type PluginState = {
  count: number;
};

export function activate(context: PluginContext): () => void {
  const state$: BehaviorSubject<PluginState> = new context.rxjs.BehaviorSubject<PluginState>({ count: 0 });
  const subscription: Subscription = state$.subscribe((state: PluginState): void => {
    console.log("plugin state", state);
  });

  state$.next({ count: 1 });

  return (): void => {
    subscription.unsubscribe();
    state$.complete();
  };
}
```

Importiere kein Runtime-RxJS aus einem ungebündelten Browser-Plugin-Entry. Wenn ein Plugin gebündelt wird, halte `rxjs`
als external oder `peerDependency` und verwende zur Laufzeit `context.rxjs`, damit Plugins keine isolierten
RxJS-Instanzen erzeugen.

RxJS-Sharing teilt nur die Bibliotheksinstanz. Plugins teilen Zustand nur, wenn sie dasselbe `Subject`,
`BehaviorSubject` oder Observable-Objekt über plugin context, eine Host-API oder eine andere explizite Bridge
weitergeben.

## Optionale backend-Skripte

Optionale backend-Skripte werden bei Bedarf lokal ausgeführt. JavaScript-backends laufen mit Node; Go-backends werden
automatisch gebaut und gecacht. Das Skript erhält die Argumente `method` und `workspaceRoot`, liest das `data` JSON von
stdin und muss gültiges JSON nach stdout schreiben.

```ts
type BackendInput = Record<string, unknown>;

type BackendOutput = {
  method: string;
  workspaceRoot: string;
  received: BackendInput;
};

const [, , method = "", workspaceRoot = ""]: string[] = process.argv;
let input = "";

process.stdin.on("data", (chunk: Buffer): void => {
  input += chunk.toString("utf8");
});

process.stdin.on("end", (): void => {
  const received: BackendInput = JSON.parse(input || "{}");
  const output: BackendOutput = { method, workspaceRoot, received };
  console.log(JSON.stringify(output));
});
```
