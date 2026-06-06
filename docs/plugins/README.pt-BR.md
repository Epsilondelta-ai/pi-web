# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Plugins are trusted local code. pi-web core stays small: it loads plugins, exposes a shared RxJS Subject registry, and
standardizes the names plugins use to share state.

## Responsibility split

Core owns only app-wide plugin infrastructure.

- Plugin install, load, reload, disable, uninstall, and cleanup lifecycle.
- `piWeb` shared RxJS Subject registry.
- Standard channel names and payload contracts.
- Stable DOM hook names for toolbar, settings, and main-area extensions.

Plugins own user-facing features.

- Chat UI, composer, transcript rendering, sessions, shortcuts, toasts, panels, and plugin-specific settings.
- Plugin-specific state and persistence.

Core does not store chat sessions, own shortcut behavior, render toast UI, or provide feature APIs for plugins.

## Folder structure

A plugin folder must contain `plugin.json` and an entry module. TypeScript plugins must be bundled or compiled to the
JavaScript file named by `entry`.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js"
}
```

`entry` is required. Paths must stay inside the plugin folder.

## Entry module

The entry module may export `activate()` or `default()`. Returning a function, or an object with `deactivate()` or
`dispose()`, lets pi-web clean up the plugin during reload, disable, or uninstall. A module-level `deactivate()` export
is also supported.

```ts
export function activate(): () => void {
  const panel: HTMLElement = document.createElement("section");
  panel.textContent = "Hello from hello-panel";
  document.querySelector("[data-main]")?.append(panel);

  return (): void => {
    panel.remove();
  };
}
```

Plugins should use browser APIs such as `document`, `localStorage`, `fetch`, direct `rxjs` imports, and the `piWeb`
global.

## Shared Subject registry

Plugins import RxJS directly for operators, `Observable`, `Subscription`, and local subjects.

```ts
import { filter, type Subscription } from "rxjs";
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
  const language$: BehaviorSubject<LanguageCode> = piWeb.behaviorSubject<LanguageCode>("core.language", "en");
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

## Channel naming standard

Use `$` suffixes for variables that hold RxJS streams. Channel names do not include `$`.

| Channel | Kind | Payload | Owner |
| --- | --- | --- | --- |
| `core.language` | `BehaviorSubject` | language code string | core |
| `core.language.changed` | `Subject` | language code string | core |
| `core.settings.changed` | `Subject` | `{ key: string; value: unknown }` | core |
| `chat.input` | `BehaviorSubject` | input text string | chat plugin |
| `chat.input.submitted` | `Subject` | `{ text: string; attachments: unknown[] }` | chat plugin |
| `session.activeId` | `BehaviorSubject` | `string | null` | session plugin |
| `session.changed` | `Subject` | session change object | session plugin |
| `shortcut.pressed` | `Subject` | shortcut event object | shortcuts plugin |
| `toast.requested` | `Subject` | toast request object | toast plugin |
| `plugin.<pluginId>.*` | any | plugin-defined | owning plugin |

Naming rules:

- Core channels start with `core.`.
- Feature plugin channels start with the feature name: `chat.`, `session.`, `shortcut.`, `toast.`.
- Private plugin channels start with `plugin.<pluginId>.`.
- Event channels use verbs or past-tense event names: `changed`, `submitted`, `received`, `pressed`.
- State channels use nouns: `core.language`, `session.activeId`, `chat.input`.

## DOM hook standard

Use these stable selectors when a plugin needs to attach UI to pi-web.

| Area | Selector | Use |
| --- | --- | --- |
| Header actions | `[data-plugin-toolbar]` | Add icon buttons to the top-right header actions. |
| Settings modal | `[data-plugin-settings-root]` | Add plugin-specific settings sections inside the settings modal. |
| Main workspace area | `.app-body[data-view="workspace"]` | Read or observe the workspace layout container. |
| Main content surface | `.main[data-main]` | Add or replace primary main-area content when your plugin owns it. |
| Sidebar surface | `[data-plugin-sidebar]` | Add optional side panels such as file browsers or git views. |

Plugins must remove DOM they created and unsubscribe from subscriptions during cleanup.
