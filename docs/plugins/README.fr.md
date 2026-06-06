# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

Les plugins sont du code local de confiance. pi-web garde le host léger et fournit seulement des standards pour le
manifest, le lifecycle, les noms de storage et un registry RxJS Subject partagé.

## Répartition des responsabilités

Core ne possède que l'infrastructure globale.

- Standard des settings et storage keys des settings.
- Standard de language et storage key de language.
- Installation, load, reload, disable, uninstall et cleanup lifecycle des plugins.
- Registry RxJS Subject partagé.
- Noms de channels et contrats de payload standard.

Les plugins possèdent les fonctionnalités visibles par l'utilisateur.

- Chat UI, composer, transcript rendering, prompt submission et attachments.
- Sessions, active session state et session persistence.
- Shortcuts et command handling.
- Toast notifications.
- State et settings propres au plugin.

Core ne stocke pas les chat sessions, ne possède pas le comportement des shortcuts et ne rend pas la toast UI. Un plugin
peut le faire directement.

## Structure du dossier

Un dossier de plugin doit contenir `plugin.json` et un entry module. Les plugins TypeScript doivent être bundlés ou
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

## Entry module

L'entry module peut exporter `activate(context)` ou `default(context)`. Retourner une fonction, ou un objet avec
`deactivate()` ou `dispose()`, permet à pi-web de nettoyer le plugin pendant reload, disable ou uninstall. Un export
module-level `deactivate(context)` est aussi supporté.

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

- `context.app` : l'élément `<pi-app>`.
- `context.plugin` : le manifest parsé.
- `context.piWeb` : l'objet standard pi-web, incluant le registry Subject partagé.
- `context.rxjs` : namespace RxJS de compatibilité. Dans les plugins bundlés, préférez importer directement `rxjs`.
- `context.api.get(path)` / `context.api.post(path, body)` : appelle les APIs HTTP pi-web.
- `context.backend(method, { workspaceId, data })` : appelle le backend script facultatif. `workspaceId` est optionnel ;
  `data` devient le JSON stdin du backend.
- `context.mount.chat(element)` / `context.mount.composer(element)` : monte les surfaces chat ou composer.
- `context.chat` : append, stream, render, finalize et scroll des transcript messages.
- `context.composer` : read, set, submit, cancel, attach ou clear le prompt input.
- `context.session` : inspecte l'active process session, post prompts, steer, cancel ou subscribe aux process events.
- `context.files` : search/read des workspace files.
- `context.shell` : exécute des workspace shell commands.

## Standard localStorage

Les plugins utilisent directement l'API navigateur `localStorage`. pi-web ne wrappe pas storage. Le standard définit
seulement le nommage des keys et la forme JSON.

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

Règles : utilisez le préfixe `pi-web:` ; utilisez le `plugin.id` du manifest dans les keys de plugin ; stockez les
valeurs structurées en JSON ; un plugin peut définir plus de keys sous `pi-web:plugin:<pluginId>:`.

## Standard RxJS

Les plugins importent RxJS directement pour les operators, `Observable`, `Subscription` et subjects locaux.

```ts
import { filter, map, type Subscription } from "rxjs";
```

pi-web fournit seulement un registry Subject partagé pour que les plugins obtiennent la même instance par nom. Il ne
wrappe pas les operators ni l'observable composition.

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

Publisher :

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

Subscriber :

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

Règles du registry :

- Le même `name` retourne la même instance Subject.
- Un name ne peut pas être réutilisé avec un autre Subject kind.
- Pour `behaviorSubject`, le premier appel possède l'initial value. Les initial values suivantes sont ignorées.
- `deleteSubject` est pour les channels appartenant aux plugins. Ne supprimez pas les core channels.
- Permissions et politiques read-only ne font pas partie de ce standard.

## Channels standard

Utilisez le suffixe `$` pour les variables contenant des streams RxJS. Les channel names n'incluent pas `$`.

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

## Règles de nommage

Les core channels commencent par `core.`. Les feature plugin channels commencent par le nom de feature : `chat.`,
`session.`, `shortcut.`, `toast.`. Les private plugin channels commencent par `plugin.<pluginId>.`. Les event channels
utilisent des verbes ou noms d'événements au passé : `changed`, `submitted`, `received`, `pressed`. Les state channels
utilisent des noms : `core.language`, `session.activeId`, `chat.input`.

## Cleanup

Les plugins doivent unsubscribe leurs subscriptions et retirer le DOM créé. Les Subjects appartenant au plugin peuvent
être completed ou deleted au unload.

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

## Backend scripts facultatifs

Les backend scripts facultatifs s'exécutent localement à la demande. Les backends JavaScript tournent avec Node ; les
backends Go sont buildés et mis en cache automatiquement. Le script reçoit les arguments `method` et `workspaceRoot`,
lit
le JSON `data` depuis stdin, et doit écrire du JSON valide sur stdout.

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
