# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Los plugins son código local de confianza. pi-web mantiene el host pequeño y solo da estándares para manifest,
lifecycle, nombres de storage y un registry compartido de RxJS Subject.

## División de responsabilidades

Core solo posee infraestructura global.

- Estándar de settings y keys de storage para settings.
- Estándar de language y key de storage para language.
- Instalación, carga, reload, disable, uninstall y cleanup lifecycle de plugins.
- Registry compartido de RxJS Subject.
- Nombres de channels y contratos de payload estándar.

Los plugins poseen las funciones visibles para el usuario.

- Chat UI, composer, transcript rendering, prompt submission y attachments.
- Sessions, active session state y session persistence.
- Shortcuts y command handling.
- Toast notifications.
- State y settings propios del plugin.

Core no guarda chat sessions, no posee comportamiento de shortcuts y no renderiza toast UI. Un plugin puede hacerlo
directamente.

## Estructura de carpeta

Una carpeta de plugin debe contener `plugin.json` y un entry module. Los plugins TypeScript deben empaquetarse o
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

## Entry module

El entry module puede exportar `activate(context)` o `default(context)`. Si devuelve una función, o un objeto con
`deactivate()` o `dispose()`, pi-web limpiará el plugin durante reload, disable o uninstall. También se admite un export
module-level `deactivate(context)`.

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

- `context.app`: elemento `<pi-app>`.
- `context.plugin`: manifest parseado.
- `context.piWeb`: objeto estándar de pi-web, incluido el registry compartido de Subject.
- `context.rxjs`: namespace RxJS de compatibilidad. En plugins empaquetados, prefiere imports directos de `rxjs`.
- `context.api.get(path)` / `context.api.post(path, body)`: llama APIs HTTP de pi-web.
- `context.backend(method, { workspaceId, data })`: llama el backend script opcional. `workspaceId` es opcional; `data`
  se convierte en JSON stdin del backend.
- `context.mount.chat(element)` / `context.mount.composer(element)`: monta surfaces de chat o composer.
- `context.chat`: append, stream, render, finalize y scroll de transcript messages.
- `context.composer`: read, set, submit, cancel, attach o clear del prompt input.
- `context.session`: inspecciona la active process session, post prompts, steer, cancel o subscribe a process events.
- `context.files`: busca o lee workspace files.
- `context.shell`: ejecuta workspace shell commands.

## Estándar localStorage

Los plugins usan directamente la API `localStorage` del navegador. pi-web no envuelve storage. El estándar solo define
nombres de keys y forma JSON.

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

Reglas: usa el prefijo `pi-web:`; usa el `plugin.id` del manifest en keys de plugin; guarda valores estructurados como
JSON; un plugin puede definir más keys bajo `pi-web:plugin:<pluginId>:`.

## Estándar RxJS

Los plugins importan RxJS directamente para operators, `Observable`, `Subscription` y subjects locales.

```ts
import { filter, map, type Subscription } from "rxjs";
```

pi-web solo ofrece un registry compartido de Subject para que los plugins obtengan la misma instancia por nombre. No
envuelve operators ni observable composition.

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

Reglas del registry:

- El mismo `name` devuelve la misma instancia de Subject.
- Un name no puede reutilizarse con otro Subject kind.
- En `behaviorSubject`, la primera llamada define el initial value. Los initial values posteriores se ignoran.
- `deleteSubject` es para channels propiedad de plugins. No borres core channels.
- Permissions y políticas read-only no forman parte de este estándar.

## Channels estándar

Usa sufijo `$` en variables que contienen streams RxJS. Los channel names no incluyen `$`.

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

## Reglas de nombres

Core channels empiezan con `core.`. Feature plugin channels empiezan con el nombre de la feature: `chat.`, `session.`,
`shortcut.`, `toast.`. Private plugin channels empiezan con `plugin.<pluginId>.`. Event channels usan verbos o nombres
de evento en pasado: `changed`, `submitted`, `received`, `pressed`. State channels usan sustantivos: `core.language`,
`session.activeId`, `chat.input`.

## Cleanup

Los plugins deben hacer unsubscribe de subscriptions y eliminar el DOM que crearon. Los Subjects propiedad del plugin
pueden completarse o borrarse al unload.

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

## Backend scripts opcionales

Los backend scripts opcionales se ejecutan localmente bajo demanda. Los backends JavaScript corren con Node; los
backends
Go se compilan y cachean automáticamente. El script recibe argumentos `method` y `workspaceRoot`, lee el JSON `data` de
stdin y debe imprimir JSON válido en stdout.

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
