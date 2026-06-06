# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Plugins sind vertrauenswürdiger lokaler Code. pi-web hält den Host klein und stellt nur Standards für Manifest,
Lifecycle, Storage-Namen und eine gemeinsame RxJS Subject Registry bereit.

## Verantwortlichkeiten

Core besitzt nur die globale Infrastruktur.

- Settings-Standard und Storage Keys für Settings.
- Language-Standard und Storage Key für Language.
- Plugin install, load, reload, disable, uninstall und cleanup lifecycle.
- Gemeinsame RxJS Subject Registry.
- Standard channel names und payload contracts.

Plugins besitzen die nutzerseitigen Funktionen.

- Chat UI, composer, transcript rendering, prompt submission und attachments.
- Sessions, active session state und session persistence.
- Shortcuts und command handling.
- Toast notifications.
- Plugin-spezifische state und settings.

Core speichert keine chat sessions, besitzt kein shortcut behavior und rendert keine toast UI. Das kann ein Plugin
direkt tun.

## Ordnerstruktur

Ein Plugin-Ordner muss `plugin.json` und ein entry module enthalten. TypeScript-Plugins müssen in die von `entry`
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

## Entry module

Das entry module kann `activate(context)` oder `default(context)` exportieren. Wenn eine Funktion oder ein Objekt mit
`deactivate()` oder `dispose()` zurückgegeben wird, räumt pi-web das Plugin bei reload, disable oder uninstall auf. Ein
module-level Export `deactivate(context)` wird ebenfalls unterstützt.

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

- `context.app`: das `<pi-app>` Element.
- `context.plugin`: das geparste Manifest.
- `context.piWeb`: pi-web Standardobjekt, inklusive gemeinsamer Subject Registry.
- `context.rxjs`: Compatibility RxJS Namespace. In gebündelten Plugins direkte `rxjs` Imports bevorzugen.
- `context.api.get(path)` / `context.api.post(path, body)`: pi-web HTTP APIs aufrufen.
- `context.backend(method, { workspaceId, data })`: optionales backend script aufrufen. `workspaceId` ist optional;
  `data` wird backend stdin JSON.
- `context.mount.chat(element)` / `context.mount.composer(element)`: chat oder composer surfaces mounten.
- `context.chat`: transcript messages append, stream, render, finalize und scroll.
- `context.composer`: prompt input read, set, submit, cancel, attach oder clear.
- `context.session`: active process session inspizieren, prompts posten, steer, cancel oder process events subscriben.
- `context.files`: workspace files suchen/lesen.
- `context.shell`: workspace shell commands ausführen.

## localStorage Standard

Plugins verwenden die Browser API `localStorage` direkt. pi-web wrappt Storage nicht. Der Standard definiert nur Key
Naming und JSON Shape.

```ts
type SessionState = {
  activeSessionId: string | null;
};

const storageKey: string = "pi-web:plugin:session:state";
const state: SessionState = { activeSessionId: "default" };
localStorage.setItem(storageKey, JSON.stringify(state));
```

| Owner | Key | Value |
| --- | --- | --- |
| core | `pi-web:settings` | app settings JSON |
| core | `pi-web:language` | language code string |
| plugin | `pi-web:plugin:<pluginId>:settings` | plugin settings JSON |
| plugin | `pi-web:plugin:<pluginId>:state` | plugin state JSON |
| session plugin | `pi-web:plugin:session:sessions` | session list JSON |
| session plugin | `pi-web:plugin:session:active-session-id` | active session id string |

Regeln: `pi-web:` als Top-Level Prefix verwenden; in Plugin Keys die Manifest `plugin.id` nutzen; strukturierte Werte
als
JSON speichern; Plugins können weitere Keys unter `pi-web:plugin:<pluginId>:` definieren.

## RxJS Standard

Plugins importieren RxJS direkt für operators, `Observable`, `Subscription` und lokale subjects.

```ts
import { filter, map, type Subscription } from "rxjs";
```

pi-web stellt nur eine gemeinsame Subject Registry bereit, damit Plugins per Name dieselbe Subject Instanz erhalten. Es
wrappt keine operators und keine observable composition.

```ts
import type { BehaviorSubject, Subject } from "rxjs";

type PiWebSubjects = {
  subject<T>(name: string): Subject<T>;
  behaviorSubject<T>(name: string, initialValue: T): BehaviorSubject<T>;
  replaySubject<T>(name: string, bufferSize?: number): import("rxjs").ReplaySubject<T>;
  asyncSubject<T>(name: string): import("rxjs").AsyncSubject<T>;
  hasSubject(name: string): boolean;
  deleteSubject(name: string): boolean;
  completeSubject(name: string): void;
  listSubjects(): string[];
};
```

Publisher:

```ts
type LanguageCode = "en" | "ko" | "ja";

type PluginContext = {
  piWeb: PiWebSubjects;
};

export function activate(context: PluginContext): void {
  const language$: BehaviorSubject<LanguageCode> = context.piWeb.behaviorSubject<LanguageCode>(
    "core.language",
    "en",
  );
  language$.next("ko");
}
```

Subscriber:

```ts
import { filter, type Subscription } from "rxjs";

type LanguageCode = "en" | "ko" | "ja";

type PluginContext = {
  piWeb: PiWebSubjects;
};

export function activate(context: PluginContext): () => void {
  const subscription: Subscription = context.piWeb
    .behaviorSubject<LanguageCode>("core.language", "en")
    .pipe(filter((language: LanguageCode): boolean => language.length > 0))
    .subscribe((language: LanguageCode): void => {
      console.log(language);
    });

  return (): void => {
    subscription.unsubscribe();
  };
}
```

Registry Regeln:

- Derselbe `name` gibt dieselbe Subject Instanz zurück.
- Ein Name kann nicht mit einem anderen Subject kind wiederverwendet werden.
- Bei `behaviorSubject` besitzt der erste Aufruf den initial value. Spätere initial values werden ignoriert.
- `deleteSubject` ist für plugin-owned channels. Core channels nicht löschen.
- Permissions und read-only policies sind bewusst nicht Teil dieses Standards.

## Standard channels

Verwende den Suffix `$` für Variablen mit RxJS streams. Channel names enthalten kein `$`.

| Channel | Kind | Payload | Owner |
| --- | --- | --- | --- |
| `core.language` | `BehaviorSubject` | language code string | core |
| `core.language.changed` | `Subject` | language code string | core |
| `core.settings.changed` | `Subject` | `{ key: string; value: unknown }` | core |
| `chat.input` | `BehaviorSubject` | input text string | chat plugin |
| `chat.input.submitted` | `Subject` | `{ text: string; attachments: unknown[] }` | chat plugin |
| `chat.message.received` | `Subject` | message object | chat plugin |
| `session.activeId` | `BehaviorSubject` | `string | null` | session plugin |
| `session.changed` | `Subject` | session change object | session plugin |
| `shortcut.pressed` | `Subject` | shortcut event object | shortcuts plugin |
| `toast.requested` | `Subject` | toast request object | toast plugin |
| `button.clicked` | `Subject` | button event object | owning plugin |
| `touch.pressed` | `Subject` | touch event object | owning plugin |

## Namensregeln

Core channels starten mit `core.`. Feature plugin channels starten mit dem Feature-Namen: `chat.`, `session.`,
`shortcut.`, `toast.`. Private plugin channels starten mit `plugin.<pluginId>.`. Event channels nutzen Verben oder
Past-Tense Eventnamen: `changed`, `submitted`, `received`, `pressed`. State channels nutzen Nomen: `core.language`,
`session.activeId`, `chat.input`.

## Cleanup

Plugins müssen subscriptions unsubscriben und selbst erzeugtes DOM entfernen. Plugin-owned Subjects können bei unload
completed oder deleted werden.

```ts
import type { Subscription } from "rxjs";

export function activate(context: PluginContext): () => void {
  const subscription: Subscription = context.piWeb
    .subject<string>("plugin.example.closed")
    .subscribe((value: string): void => console.log(value));

  return (): void => {
    subscription.unsubscribe();
    context.piWeb.completeSubject("plugin.example.closed");
    context.piWeb.deleteSubject("plugin.example.closed");
  };
}
```

## Optionale backend scripts

Optionale backend scripts werden lokal bei Bedarf ausgeführt. JavaScript backends laufen mit Node; Go backends werden
automatisch gebaut und gecached. Das Script erhält die Argumente `method` und `workspaceRoot`, liest das `data` JSON aus
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
  const received: BackendInput = JSON.parse(input || "{}") as BackendInput;
  const output: BackendOutput = { method, workspaceRoot, received };
  console.log(JSON.stringify(output));
});
```
