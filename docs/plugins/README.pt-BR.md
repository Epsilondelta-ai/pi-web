# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Plugins são experimentais e destinados a código local confiável. A API pode mudar antes de ficar estável.

## Estrutura da pasta

Uma pasta de plugin deve conter `plugin.json` e um módulo de entrada. Plugins TypeScript devem ser empacotados ou
compilados para o arquivo JavaScript indicado por `entry`.

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

## Módulo de entrada

O módulo de entrada pode exportar `activate(context)` ou `default(context)`. Retornar uma função, ou um objeto com
`deactivate()` ou `dispose()`, permite que o pi-web limpe o plugin durante reload, disable ou uninstall. Um export de
módulo `deactivate(context)` também é suportado.

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

## Context do plugin

- `context.app`: o elemento `<pi-app>`.
- `context.plugin`: o manifesto analisado.
- `context.rxjs`: o namespace RxJS fornecido pelo pi-web core.
- `context.api.get(path)` / `context.api.post(path, body)`: chama APIs HTTP do pi-web.
- `context.backend(method, { workspaceId, data })`: chama o script backend opcional. `workspaceId` é opcional; `data`
  vira JSON no stdin do backend.
- `context.mount.chat(element)` / `context.mount.composer(element)`: monta superfícies de chat ou composer.
- `context.chat`: adiciona, transmite, renderiza, finaliza e rola mensagens do transcript.
- `context.composer`: lê, define, envia, cancela, anexa ou limpa a entrada de prompt.
- `context.session`: inspeciona a sessão ativa, envia prompts, steer, cancela ou assina eventos de sessão.
- `context.files`: pesquisa ou lê arquivos do workspace.
- `context.shell`: executa comandos shell do workspace.

## Core RxJS para plugins

O pi-web instala RxJS no core e o expõe como `context.rxjs`. Use isso em vez de empacotar uma cópia separada do RxJS
quando plugins precisarem de observables, subjects ou subscriptions compatíveis.

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

Não importe RxJS em runtime em uma entry de plugin de navegador sem bundle. Se o plugin for empacotado, mantenha `rxjs`
como
external ou `peerDependency` e use `context.rxjs` em runtime para que plugins não criem instâncias RxJS isoladas.

Compartilhar RxJS compartilha apenas a instância da biblioteca. Plugins só compartilham estado quando passam o mesmo
`Subject`, `BehaviorSubject` ou objeto observable pelo plugin context, por uma API do host ou por outro bridge
explícito.

## Scripts backend opcionais

Scripts backend opcionais são executados localmente sob demanda. Backends JavaScript rodam com Node; backends Go são
compilados e cacheados automaticamente. O script recebe os argumentos `method` e `workspaceRoot`, lê o JSON `data` do
stdin e deve imprimir JSON válido no stdout.

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
