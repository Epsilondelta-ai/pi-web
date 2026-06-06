# Плагины

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Плагины — доверенный локальный код. pi-web держит host небольшим и задает только стандарты manifest, lifecycle, имен
storage и общего registry для RxJS Subject.

## Разделение ответственности

Core владеет только общей инфраструктурой.

- Стандарт settings и storage keys для settings.
- Стандарт language и storage key для language.
- Plugin install, load, reload, disable, uninstall и cleanup lifecycle.
- Общий RxJS Subject registry.
- Стандартные channel names и payload contracts.

Плагины владеют пользовательскими функциями.

- Chat UI, composer, transcript rendering, prompt submission и attachments.
- Sessions, active session state и session persistence.
- Shortcuts и command handling.
- Toast notifications.
- Собственные state и settings плагина.

Core не хранит chat sessions, не владеет shortcut behavior и не рендерит toast UI. Это может делать плагин напрямую.

## Структура папки

Папка плагина должна содержать `plugin.json` и entry module. TypeScript-плагины нужно bundle или compile в JavaScript
файл, указанный в `entry`.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` обязателен. `backend` необязателен. Оба пути должны оставаться внутри папки плагина.

## Entry module

Entry module может export `activate(context)` или `default(context)`. Если вернуть function или object с `deactivate()`
/
`dispose()`, pi-web выполнит cleanup при reload, disable или uninstall. Module-level export `deactivate(context)` тоже
поддерживается.

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

- `context.app`: элемент `<pi-app>`.
- `context.plugin`: parsed manifest.
- `context.piWeb`: стандартный object pi-web, включая общий Subject registry.
- `context.rxjs`: compatibility RxJS namespace. В bundled plugins предпочтительны прямые imports из `rxjs`.
- `context.api.get(path)` / `context.api.post(path, body)`: вызов pi-web HTTP APIs.
- `context.backend(method, { workspaceId, data })`: вызов optional backend script. `workspaceId` optional; `data`
  становится backend stdin JSON.
- `context.mount.chat(element)` / `context.mount.composer(element)`: mount chat или composer surfaces.
- `context.chat`: append, stream, render, finalize и scroll transcript messages.
- `context.composer`: read, set, submit, cancel, attach или clear prompt input.
- `context.session`: inspect active process session, post prompts, steer, cancel или subscribe to process events.
- `context.files`: search/read workspace files.
- `context.shell`: run workspace shell commands.

## Стандарт localStorage

Плагины используют browser API `localStorage` напрямую. pi-web не оборачивает storage. Стандарт задает только key naming
и
JSON shape.

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

Правила: используйте prefix `pi-web:`; в plugin keys используйте `plugin.id` из manifest; structured values храните как
JSON; плагины могут добавлять keys под `pi-web:plugin:<pluginId>:`.

## Стандарт RxJS

Плагины импортируют RxJS напрямую для operators, `Observable`, `Subscription` и локальных subjects.

```ts
import { filter, map, type Subscription } from "rxjs";
```

pi-web предоставляет только общий Subject registry, чтобы плагины получали один и тот же Subject instance по имени. Он
не
оборачивает operators или observable composition.

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

Registry rules:

- Один и тот же `name` возвращает один и тот же Subject instance.
- Name нельзя переиспользовать с другим Subject kind.
- Для `behaviorSubject` первый вызов владеет initial value. Последующие initial values игнорируются.
- `deleteSubject` предназначен для plugin-owned channels. Не удаляйте core channels.
- Permissions и read-only policies не входят в этот стандарт.

## Стандартные channels

Используйте суффикс `$` для переменных, которые содержат RxJS streams. Channel names не содержат `$`.

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

## Правила именования

Core channels начинаются с `core.`. Feature plugin channels начинаются с имени feature: `chat.`, `session.`,
`shortcut.`,
`toast.`. Private plugin channels начинаются с `plugin.<pluginId>.`. Event channels используют verbs или past-tense
event
names: `changed`, `submitted`, `received`, `pressed`. State channels используют nouns: `core.language`,
`session.activeId`, `chat.input`.

## Cleanup

Плагины должны unsubscribe subscriptions и удалять созданный DOM. Plugin-owned Subjects можно complete или delete при
unload.

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

## Optional backend scripts

Optional backend scripts запускаются локально по требованию. JavaScript backends выполняются через Node; Go backends
автоматически build/cache. Script получает arguments `method` и `workspaceRoot`, читает `data` JSON из stdin и должен
напечатать valid JSON в stdout.

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
