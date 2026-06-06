# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Plugins são código local confiável. O pi-web mantém o host pequeno e fornece apenas padrões para manifest, lifecycle,
nomes de storage e um registry compartilhado de RxJS Subject.

## Divisão de responsabilidades

Core cuida apenas da infraestrutura global.

- Padrão de settings e storage keys de settings.
- Padrão de language e storage key de language.
- Instalação, load, reload, disable, uninstall e cleanup lifecycle de plugins.
- Registry compartilhado de RxJS Subject.
- Nomes de channels e contratos de payload padrão.

Plugins cuidam das funções visíveis ao usuário.

- Chat UI, composer, transcript rendering, prompt submission e attachments.
- Sessions, active session state e session persistence.
- Shortcuts e command handling.
- Toast notifications.
- State e settings específicos do plugin.

Core não armazena chat sessions, não controla shortcuts e não renderiza toast UI. Um plugin pode fazer isso diretamente.

## Estrutura da pasta

Uma pasta de plugin deve conter `plugin.json` e um entry module. Plugins TypeScript devem ser empacotados ou compilados
para o arquivo JavaScript indicado por `entry`.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` é obrigatório. `backend` é opcional. Ambos os caminhos devem permanecer dentro da pasta do plugin.

## Entry module

O entry module pode exportar `activate(context)` ou `default(context)`. Retornar uma função, ou um objeto com
`deactivate()` ou `dispose()`, permite que o pi-web limpe o plugin durante reload, disable ou uninstall. Um export
module-level `deactivate(context)` também é suportado.

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
- `context.piWeb`: objeto padrão do pi-web, incluindo o registry compartilhado de Subject.
- `context.rxjs`: namespace RxJS de compatibilidade. Em plugins empacotados, prefira imports diretos de `rxjs`.
- `context.api.get(path)` / `context.api.post(path, body)`: chama APIs HTTP do pi-web.
- `context.backend(method, { workspaceId, data })`: chama o backend script opcional. `workspaceId` é opcional; `data`
  vira o JSON stdin do backend.
- `context.mount.chat(element)` / `context.mount.composer(element)`: monta surfaces de chat ou composer.
- `context.chat`: append, stream, render, finalize e scroll de transcript messages.
- `context.composer`: read, set, submit, cancel, attach ou clear do prompt input.
- `context.session`: inspeciona active process session, post prompts, steer, cancel ou subscribe a process events.
- `context.files`: search/read de workspace files.
- `context.shell`: executa workspace shell commands.

## Padrão localStorage

Plugins usam diretamente a API `localStorage` do navegador. O pi-web não encapsula storage. O padrão define apenas nomes
de keys e formato JSON.

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

Regras: use o prefixo `pi-web:`; use o `plugin.id` do manifest em keys de plugin; salve valores estruturados como JSON;
plugins podem definir mais keys sob `pi-web:plugin:<pluginId>:`.

## Padrão RxJS

Plugins importam RxJS diretamente para operators, `Observable`, `Subscription` e subjects locais.

```ts
import { filter, map, type Subscription } from "rxjs";
```

O pi-web fornece apenas um registry compartilhado de Subject para que plugins obtenham a mesma instância por nome. Ele
não encapsula operators nem observable composition.

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

Regras do registry:

- O mesmo `name` retorna a mesma instância de Subject.
- Um name não pode ser reutilizado com outro Subject kind.
- Em `behaviorSubject`, a primeira chamada define o initial value. Initial values posteriores são ignorados.
- `deleteSubject` é para channels de propriedade de plugins. Não delete core channels.
- Permissions e políticas read-only não fazem parte deste padrão.

## Channels padrão

Use sufixo `$` em variáveis que guardam streams RxJS. Channel names não incluem `$`.

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

## Regras de nomenclatura

Core channels começam com `core.`. Feature plugin channels começam com o nome da feature: `chat.`, `session.`,
`shortcut.`, `toast.`. Private plugin channels começam com `plugin.<pluginId>.`. Event channels usam verbos ou nomes de
evento no passado: `changed`, `submitted`, `received`, `pressed`. State channels usam substantivos: `core.language`,
`session.activeId`, `chat.input`.

## Cleanup

Plugins devem fazer unsubscribe de subscriptions e remover o DOM criado. Subjects de propriedade do plugin podem ser
completed ou deleted no unload.

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

## Backend scripts opcionais

Backend scripts opcionais são executados localmente sob demanda. Backends JavaScript rodam com Node; backends Go são
buildados e cacheados automaticamente. O script recebe os argumentos `method` e `workspaceRoot`, lê o JSON `data` de
stdin e deve imprimir JSON válido em stdout.

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
