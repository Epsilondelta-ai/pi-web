# プラグイン

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

プラグインは信頼できるローカルコードです。pi-web は host を小さく保ち、manifest、lifecycle、storage key 名、共有 RxJS Subject registry の標準だけを提供します。

## 責任分担

Core はアプリ全体の基盤だけを担当します。

- 設定標準と settings storage key。
- 言語標準と language storage key。
- プラグインの install、load、reload、disable、uninstall、cleanup lifecycle。
- 共有 RxJS Subject registry。
- 標準 channel 名と payload contract。

プラグインはユーザー向け機能を担当します。

- Chat UI、composer、transcript rendering、prompt submit、attachments。
- Sessions、active session state、session persistence。
- Shortcuts と command handling。
- Toast notifications。
- プラグイン固有の state と settings。

Core は chat sessions を保存せず、shortcut behavior を所有せず、toast UI を render しません。それらはプラグインが直接実装できます。

## フォルダ構成

プラグインフォルダには `plugin.json` と entry module が必要です。TypeScript プラグインは `entry` が指す JavaScript file へ bundle または compile
してください。

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` は必須、`backend` は任意です。どちらの path もプラグインフォルダ内にある必要があります。

## Entry module

Entry module は `activate(context)` または `default(context)` を export できます。function、または `deactivate()` / `dispose()` を持つ
object を返すと、pi-web は reload、disable、uninstall 時に cleanup します。Module-level `deactivate(context)` export もサポートします。

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

- `context.app`: `<pi-app>` element。
- `context.plugin`: parsed manifest。
- `context.piWeb`: 共有 Subject registry を含む pi-web standard object。
- `context.rxjs`: compatibility RxJS namespace。Bundle 済み plugin では直接 `rxjs` import を優先します。
- `context.api.get(path)` / `context.api.post(path, body)`: pi-web HTTP APIs を呼び出します。
- `context.backend(method, { workspaceId, data })`: 任意の backend script を呼び出します。`workspaceId` は任意で、`data` は backend stdin
  JSON になります。
- `context.mount.chat(element)` / `context.mount.composer(element)`: chat または composer surface を mount します。
- `context.chat`: transcript messages の append、stream、render、finalize、scroll。
- `context.composer`: prompt input の read、set、submit、cancel、attach、clear。
- `context.session`: active process session の確認、prompt post、steer、cancel、process events の subscribe。
- `context.files`: workspace files の search/read。
- `context.shell`: workspace shell command の実行。

## localStorage 標準

プラグインは browser `localStorage` API を直接使います。pi-web は storage を wrap しません。標準は key naming と JSON shape だけです。

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

Rules: top-level prefix は `pi-web:`。Plugin key には manifest の `plugin.id` を使います。構造化値は JSON として保存します。Plugins は
`pi-web:plugin:<pluginId>:` 以下に追加 key を定義できます。

## RxJS 標準

Plugins は operators、`Observable`、`Subscription`、local subjects のために RxJS を直接 import します。

```ts
import { filter, map, type Subscription } from "rxjs";
```

pi-web は共有 Subject registry だけを提供し、plugins が同じ名前で同じ Subject instance を取得できるようにします。Operators や observable composition は
wrap しません。

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

Publisher example:

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

Subscriber example:

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

Registry rules: 同じ `name` は同じ Subject instance を返します。同じ name を別の Subject kind で再利用できません。`behaviorSubject` は最初の call が
initial value を所有し、後の initial value は無視します。`deleteSubject` は plugin-owned channels 用です。Permissions と read-only policies
はこの標準に含めません。

## 標準 channels

RxJS stream を保持する変数には `$` suffix を使います。Channel name には `$` を含めません。

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

## Naming rules

Core channels は `core.` で始めます。Feature plugin channels は feature name で始めます: `chat.`, `session.`, `shortcut.`,
`toast.`。Private plugin channels は `plugin.<pluginId>.` で始めます。Event channels は verb または past-tense event name を使います:
`changed`, `submitted`, `received`, `pressed`。State channels は nouns を使います: `core.language`, `session.activeId`,
`chat.input`。

## Cleanup

Plugins は subscriptions を unsubscribe し、自分が作成した DOM を削除する必要があります。Plugin-owned Subjects は unload 時に complete または delete
できます。

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

## 任意 backend scripts

任意 backend scripts は必要時にローカルで実行されます。JavaScript backends は Node で実行され、Go backends は自動で build/cache されます。Script は `method`
と `workspaceRoot` arguments を受け取り、stdin から `data` JSON を読み、stdout に valid JSON を出力する必要があります。

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
