# Plugins

[English](plugins.md) | [한국어](plugins.ko.md) | [简体中文](plugins.zh-CN.md) | [日本語](plugins.ja.md) |
[Español](plugins.es.md) | [Português (BR)](plugins.pt-BR.md) | [Français](plugins.fr.md) |
[Русский](plugins.ru.md) | [Deutsch](plugins.de.md)

Les plugins sont expérimentaux et destinés à du code local de confiance. L'API peut changer avant d'être stable.

## Structure du dossier

Un dossier de plugin doit contenir `plugin.json` et un module d'entrée. Les plugins TypeScript doivent être bundlés ou
compilés vers le fichier JavaScript indiqué par `entry`.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` est obligatoire. `backend` est facultatif. Les deux chemins doivent rester dans le dossier du plugin.

## Module d'entrée

Le module d'entrée peut exporter `activate(context)` ou `default(context)`. Renvoyer une fonction, ou un objet avec
`deactivate()` ou `dispose()`, permet à pi-web de nettoyer le plugin lors du reload, disable ou uninstall. Un export de
module `deactivate(context)` est aussi pris en charge.

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

## Context du plugin

- `context.app` : l'élément `<pi-app>`.
- `context.plugin` : le manifeste analysé.
- `context.rxjs` : le namespace RxJS fourni par pi-web core.
- `context.api.get(path)` / `context.api.post(path, body)` : appelle les API HTTP pi-web.
- `context.backend(method, { workspaceId, data })` : appelle le script backend facultatif. `workspaceId` est facultatif
  ;
  `data` devient le JSON stdin du backend.
- `context.mount.chat(element)` / `context.mount.composer(element)` : monte des surfaces chat ou composer.
- `context.chat` : ajoute, stream, rend, finalise et fait défiler les messages du transcript.
- `context.composer` : lit, définit, soumet, annule, joint ou efface l'entrée du prompt.
- `context.session` : inspecte la session active, poste des prompts, steer, annule ou s'abonne aux événements session.
- `context.files` : recherche ou lit les fichiers du workspace.
- `context.shell` : exécute des commandes shell du workspace.

## Core RxJS pour les plugins

pi-web installe RxJS dans core et l'expose comme `context.rxjs`. Utilisez-le au lieu d'embarquer une copie séparée de
RxJS lorsque les plugins ont besoin d'observables, subjects ou subscriptions compatibles.

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

N'importez pas RxJS au runtime depuis une entry de plugin navigateur non bundlée. Si un plugin est bundlé, gardez `rxjs`
en external ou `peerDependency` et utilisez `context.rxjs` au runtime pour éviter des instances RxJS isolées par plugin.

Le partage de RxJS ne partage que l'instance de bibliothèque. Les plugins ne partagent l'état que lorsqu'ils
transmettent
le même `Subject`, `BehaviorSubject` ou objet observable via le plugin context, une API host ou un autre bridge
explicite.

## Scripts backend facultatifs

Les scripts backend facultatifs sont exécutés localement à la demande. Les backends JavaScript s'exécutent avec Node ;
les
backends Go sont compilés et mis en cache automatiquement. Le script reçoit les arguments `method` et `workspaceRoot`,
lit
le JSON `data` depuis stdin et doit écrire un JSON valide sur stdout.

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
