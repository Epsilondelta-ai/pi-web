# Plugins

Plugins are experimental and intended for trusted local code. The API can change before it is stable.

## Folder structure

A plugin folder must contain `plugin.json` and an entry JavaScript module.

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

## Plugin context

- `context.app`: the `<pi-app>` element.
- `context.plugin`: the parsed manifest.
- `context.rxjs`: the RxJS namespace provided by pi-web core.
- `context.api.get(path)` / `context.api.post(path, body)`: call pi-web HTTP APIs.
- `context.backend(method, { workspaceId, data })`: call the optional backend script. `workspaceId` is optional; `data`
  becomes the backend stdin JSON.
- `context.mount.chat(element)` / `context.mount.composer(element)`: mount chat or composer surfaces.
- `context.chat`: append, stream, render, finalize, and scroll transcript messages.
- `context.composer`: read, set, submit, cancel, attach, or clear prompt input.
- `context.session`: inspect the active session, post prompts, steer, cancel, or subscribe to session events.
- `context.files`: search or read workspace files.
- `context.shell`: run workspace shell commands.

## Core RxJS for plugins

pi-web installs RxJS in core and exposes it as `context.rxjs`. Use this instead of bundling a separate RxJS copy when
plugins need compatible observables, subjects, or subscriptions.

```js
export function activate(context) {
  const { BehaviorSubject } = context.rxjs;
  const state$ = new BehaviorSubject({ count: 0 });
  const subscription = state$.subscribe((state) => {
    console.log("plugin state", state);
  });

  state$.next({ count: 1 });

  return () => {
    subscription.unsubscribe();
    state$.complete();
  };
}
```

Do not `import "rxjs"` from an unbundled browser plugin entry. If a plugin is bundled, keep `rxjs` external or a
`peerDependency` and use `context.rxjs` at runtime so plugins do not create isolated RxJS instances.

RxJS sharing only shares the library instance. Plugins share state only when they pass the same `Subject`,
`BehaviorSubject`, or observable object through plugin context, a host API, or another explicit bridge.

## Optional backend scripts

Optional backend scripts are executed locally on demand. JavaScript backends run with Node; Go backends are built and
cached automatically. The script receives `method` and `workspaceRoot` arguments, reads the `data` JSON from stdin, and
must print valid JSON to stdout.

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
