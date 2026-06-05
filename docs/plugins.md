# Plugins

[English](plugins.md) | [한국어](plugins.ko.md) | [简体中文](plugins.zh-CN.md) | [日本語](plugins.ja.md) |
[Español](plugins.es.md) | [Português (BR)](plugins.pt-BR.md) | [Français](plugins.fr.md) |
[Русский](plugins.ru.md) | [Deutsch](plugins.de.md)

Plugins are experimental and intended for trusted local code. The API can change before it is stable.

## Folder structure

A plugin folder must contain `plugin.json` and an entry module. TypeScript plugins should be bundled or compiled to the
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

The entry module may export `activate(context)` or `default(context)`. Returning a function, or an object with
`deactivate()` or `dispose()`, lets pi-web clean up the plugin during reload, disable, or uninstall. A module-level
`deactivate(context)` export is also supported.

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

- `context.app`: the `<pi-app>` element.
- `context.plugin`: the parsed manifest.
- `context.rxjs`: the RxJS namespace provided by pi-web core.
- `context.api.get(path)` / `context.api.post(path, body)`: call pi-web HTTP APIs.
- `context.backend(method, { workspaceId, data })`: call the optional backend script. `workspaceId` is optional;
  `data` becomes the backend stdin JSON.
- `context.mount.chat(element)` / `context.mount.composer(element)`: mount chat or composer surfaces.
- `context.chat`: append, stream, render, finalize, and scroll transcript messages.
- `context.composer`: read, set, submit, cancel, attach, or clear prompt input.
- `context.session`: inspect the active session, post prompts, steer, cancel, or subscribe to session events.
- `context.files`: search or read workspace files.
- `context.shell`: run workspace shell commands.

## Core RxJS for plugins

pi-web installs RxJS in core and exposes it as `context.rxjs`. Use this instead of bundling a separate RxJS copy when
plugins need compatible observables, subjects, or subscriptions.

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

Do not import runtime RxJS from an unbundled browser plugin entry. If a plugin is bundled, keep `rxjs` external or a
`peerDependency` and use `context.rxjs` at runtime so plugins do not create isolated RxJS instances.

RxJS sharing only shares the library instance. Plugins share state only when they pass the same `Subject`,
`BehaviorSubject`, or observable object through plugin context, a host API, or another explicit bridge.

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
  const received: BackendInput = JSON.parse(input || "{}");
  const output: BackendOutput = { method, workspaceRoot, received };
  console.log(JSON.stringify(output));
});
```
