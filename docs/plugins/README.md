# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Plugins are trusted local code. pi-web keeps the host small and gives plugins a few standards: manifest shape,
lifecycle, storage names, and a shared RxJS Subject registry.

## Responsibility split

Core owns app-wide infrastructure only.

- Settings standard and settings storage keys.
- Language standard and language storage key.
- Plugin install, load, reload, disable, uninstall, and cleanup lifecycle.
- Shared RxJS Subject registry.
- Standard channel names and payload contracts.

Plugins own user-facing features.

- Chat UI, composer, transcript rendering, prompt submission, attachments.
- Sessions, active session state, and session persistence.
- Shortcuts and command handling.
- Toast notifications.
- Plugin-specific state and settings.

Core does not store chat sessions, own shortcut behavior, or render toast UI. A plugin may do that directly.

## Folder structure

A plugin folder must contain `plugin.json` and an entry module. TypeScript plugins must be bundled or compiled to the
JavaScript file named by `entry`.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` is required. `backend` is optional. Both paths must stay inside the plugin folder.

## Entry module

The entry module may export `activate()` or `default()`. Returning a function, or an object with `deactivate()` or
`dispose()`, lets pi-web clean up the plugin during reload, disable, or uninstall. A module-level `deactivate()` export
is also supported.

```ts
export function activate(): () => void {
  const panel: HTMLElement = document.createElement("section");
  panel.dataset.pluginPanel = "hello-panel";
  panel.textContent = "Hello from hello-panel";
  document.querySelector("[data-plugin-sidebar]")?.append(panel);

  return (): void => {
    panel.remove();
  };
}
```

## Plugin globals

pi-web exposes one browser global for shared standards.

- `piWeb.subject(name)`: get or create a shared RxJS `Subject`.
- `piWeb.behaviorSubject(name, initialValue)`: get or create a shared RxJS `BehaviorSubject`.
- `piWeb.replaySubject(name, bufferSize)`: get or create a shared RxJS `ReplaySubject`.
- `piWeb.asyncSubject(name)`: get or create a shared RxJS `AsyncSubject`.
- `piWeb.hasSubject(name)`, `deleteSubject(name)`, `completeSubject(name)`, and `listSubjects()` manage the
  registry.

Older builds may pass a compatibility `context` argument to `activate(context)`. New plugins should prefer browser APIs
such as `document`, `localStorage`, `fetch`, direct `rxjs` imports, and `piWeb`.

## localStorage standard

Plugins use the browser `localStorage` API directly. pi-web does not wrap storage. The standard is only key naming and
JSON shape.

```ts
type SessionState = {
  activeSessionId: string | null;
};

const storageKey: string = "pi-web:plugin:session:state";
const state: SessionState = { activeSessionId: "default" };
localStorage.setItem(storageKey, JSON.stringify(state));
```

Use these key patterns.

| Owner | Key | Value |
| --- | --- | --- |
| core | `pi-web:settings` | app settings JSON |
| core | `pi-web:language` | language code string |
| plugin | `pi-web:plugin:<pluginId>:settings` | plugin settings JSON |
| plugin | `pi-web:plugin:<pluginId>:state` | plugin state JSON |
| session plugin | `pi-web:plugin:session:sessions` | session list JSON |
| session plugin | `pi-web:plugin:session:active-session-id` | active session id string |

Rules:

- Use `pi-web:` as the top-level prefix.
- Use the manifest `plugin.id` in plugin keys.
- Store structured values as JSON.
- Plugins may define more keys under `pi-web:plugin:<pluginId>:`.

## RxJS standard

Plugins import RxJS directly for operators, `Observable`, `Subscription`, and local subjects.

```ts
import { filter, map, type Subscription } from "rxjs";
```

pi-web only provides a shared Subject registry so plugins can get the same Subject instance by name. It does not wrap
operators or observable composition.

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

Example publisher:

```ts
import type { BehaviorSubject } from "rxjs";

type LanguageCode = "en" | "ko" | "ja";

export function activate(): void {
  const language$: BehaviorSubject<LanguageCode> = piWeb.behaviorSubject<LanguageCode>(
    "core.language",
    "en",
  );
  language$.next("ko");
}
```

Example subscriber:

```ts
import { filter, type Subscription } from "rxjs";

type LanguageCode = "en" | "ko" | "ja";

export function activate(): () => void {
  const subscription: Subscription = piWeb
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

Registry rules:

- The same `name` returns the same Subject instance.
- A name cannot be reused with a different Subject kind.
- For `behaviorSubject`, the first call owns the initial value. Later initial values are ignored.
- `deleteSubject` is for plugin-owned channels. Do not delete core channels.
- Permissions and read-only policies are intentionally not part of this standard.

## Standard channels

Use `$` suffixes for variables that hold RxJS streams. Channel names do not include `$`.

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

## Naming rules

- Core channels start with `core.`.
- Feature plugin channels start with the feature name: `chat.`, `session.`, `shortcut.`, `toast.`.
- Private plugin channels start with `plugin.<pluginId>.`.
- Event channels use verbs or past-tense event names: `changed`, `submitted`, `received`, `pressed`.
- State channels use nouns: `core.language`, `session.activeId`, `chat.input`.

## Cleanup

Plugins must unsubscribe from subscriptions and remove DOM they created. Plugin-owned Subjects may be completed or
deleted on unload.

```ts
import type { Subscription } from "rxjs";

export function activate(): () => void {
  const subscription: Subscription = piWeb
    .subject<string>("plugin.example.closed")
    .subscribe((value: string): void => console.log(value));

  return (): void => {
    subscription.unsubscribe();
    piWeb.completeSubject("plugin.example.closed");
    piWeb.deleteSubject("plugin.example.closed");
  };
}
```

## Optional backend scripts

Optional backend scripts are executed locally on demand. JavaScript backends run with Node; Go backends are built and
cached automatically. The script receives `method` and `workspaceRoot` arguments, reads the `data` JSON from stdin, and
must print valid JSON to stdout.

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
