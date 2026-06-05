# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Los plugins son experimentales y están pensados para código local de confianza. La API puede cambiar antes de ser
estable.

## Estructura de carpeta

Una carpeta de plugin debe contener `plugin.json` y un módulo de entrada. Los plugins TypeScript deben empaquetarse o
compilarse al archivo JavaScript indicado por `entry`.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` es obligatorio. `backend` es opcional. Ambas rutas deben permanecer dentro de la carpeta del plugin.

## Módulo de entrada

El módulo de entrada puede exportar `activate(context)` o `default(context)`. Si devuelve una función, o un objeto con
`deactivate()` o `dispose()`, pi-web puede limpiar el plugin al recargar, deshabilitar o desinstalar. También se admite
un export de módulo `deactivate(context)`.

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

## Context del plugin

- `context.app`: el elemento `<pi-app>`.
- `context.plugin`: el manifiesto parseado.
- `context.rxjs`: el namespace RxJS proporcionado por pi-web core.
- `context.api.get(path)` / `context.api.post(path, body)`: llama APIs HTTP de pi-web.
- `context.backend(method, { workspaceId, data })`: llama el script backend opcional. `workspaceId` es opcional;
  `data` se convierte en JSON por stdin para el backend.
- `context.mount.chat(element)` / `context.mount.composer(element)`: monta superficies de chat o composer.
- `context.chat`: añade, transmite, renderiza, finaliza y desplaza mensajes del transcript.
- `context.composer`: lee, define, envía, cancela, adjunta o limpia la entrada del prompt.
- `context.session`: inspecciona la sesión activa, envía prompts, steer, cancela o suscribe eventos de sesión.
- `context.files`: busca o lee archivos del workspace.
- `context.shell`: ejecuta comandos shell del workspace.

## Core RxJS para plugins

pi-web instala RxJS en core y lo expone como `context.rxjs`. Úsalo en lugar de empaquetar una copia separada de RxJS
cuando los plugins necesiten observables, subjects o subscriptions compatibles.

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

No importes RxJS en runtime desde una entry de plugin de navegador sin bundle. Si el plugin se empaqueta, deja `rxjs`
como
external o `peerDependency` y usa `context.rxjs` en runtime para no crear instancias RxJS aisladas por plugin.

Compartir RxJS solo comparte la instancia de la librería. Los plugins comparten estado únicamente cuando pasan el mismo
`Subject`, `BehaviorSubject` u objeto observable mediante plugin context, una API del host u otro bridge explícito.

## Scripts backend opcionales

Los scripts backend opcionales se ejecutan localmente bajo demanda. Los backends JavaScript se ejecutan con Node; los
backends Go se compilan y cachean automáticamente. El script recibe los argumentos `method` y `workspaceRoot`, lee el
JSON `data` desde stdin y debe imprimir JSON válido en stdout.

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
