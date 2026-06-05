# Плагины

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Плагины — экспериментальная возможность для доверенного локального кода. API может измениться до стабилизации.

## Структура папки

Папка плагина должна содержать `plugin.json` и входной модуль. TypeScript-плагины нужно собрать или скомпилировать в
JavaScript-файл, указанный в `entry`.

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

## Входной модуль

Входной модуль может экспортировать `activate(context)` или `default(context)`. Если вернуть функцию или объект с
`deactivate()` либо `dispose()`, pi-web сможет очистить плагин при reload, disable или uninstall. Также поддерживается
экспорт модуля `deactivate(context)`.

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

## Context плагина

- `context.app`: элемент `<pi-app>`.
- `context.plugin`: разобранный манифест.
- `context.rxjs`: namespace RxJS, предоставленный pi-web core.
- `context.api.get(path)` / `context.api.post(path, body)`: вызов HTTP API pi-web.
- `context.backend(method, { workspaceId, data })`: вызов необязательного backend-скрипта. `workspaceId` необязателен;
  `data` становится JSON для stdin backend.
- `context.mount.chat(element)` / `context.mount.composer(element)`: монтирует chat или composer surface.
- `context.chat`: добавляет, стримит, рендерит, финализирует и прокручивает сообщения transcript.
- `context.composer`: читает, задаёт, отправляет, отменяет, прикрепляет или очищает prompt input.
- `context.session`: проверяет active session, отправляет prompts, steer, cancel или подписывается на session events.
- `context.files`: ищет или читает файлы workspace.
- `context.shell`: запускает shell-команды workspace.

## Core RxJS для плагинов

pi-web устанавливает RxJS в core и предоставляет его как `context.rxjs`. Используйте это вместо отдельной копии RxJS,
если плагинам нужны совместимые observable, subject или subscription.

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

Не импортируйте runtime RxJS в небандленном browser plugin entry. Если плагин собирается бандлером, оставьте `rxjs` как
external или `peerDependency` и используйте `context.rxjs` во время выполнения, чтобы плагины не создавали изолированные
экземпляры RxJS.

Совместное использование RxJS делит только экземпляр библиотеки. Плагины делят состояние только когда передают один и
тот
же `Subject`, `BehaviorSubject` или observable object через plugin context, host API или другой явный bridge.

## Необязательные backend-скрипты

Необязательные backend-скрипты выполняются локально по запросу. JavaScript backend запускается через Node; Go backend
автоматически собирается и кэшируется. Скрипт получает аргументы `method` и `workspaceRoot`, читает JSON `data` из stdin
и должен вывести валидный JSON в stdout.

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
