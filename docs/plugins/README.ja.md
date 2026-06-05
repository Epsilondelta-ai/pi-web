# プラグイン

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

プラグインは実験的機能であり、信頼できるローカルコード向けです。安定版になる前に API が変更される場合があります。

## フォルダ構成

プラグインフォルダには `plugin.json` と entry モジュールが必要です。TypeScript プラグインは `entry` が指す JavaScript ファイルへ bundle または compile してください。

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` は必須で、`backend` は任意です。どちらのパスもプラグインフォルダ内にある必要があります。

## Entry モジュール

Entry モジュールは `activate(context)` または `default(context)` を export できます。関数、または
`deactivate()` / `dispose()` を持つオブジェクトを返すと、reload、disable、uninstall 時に pi-web が
プラグインをクリーンアップします。モジュールレベルの `deactivate(context)` export もサポートします。

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

## プラグイン context

- `context.app`: `<pi-app>` 要素。
- `context.plugin`: パース済みマニフェスト。
- `context.rxjs`: pi-web core が提供する RxJS namespace。
- `context.api.get(path)` / `context.api.post(path, body)`: pi-web HTTP API を呼び出します。
- `context.backend(method, { workspaceId, data })`: 任意の backend スクリプトを呼び出します。`workspaceId` は
  任意で、`data` は backend の stdin JSON になります。
- `context.mount.chat(element)` / `context.mount.composer(element)`: chat または composer surface を mount。
- `context.chat`: transcript message の append、stream、render、finalize、scroll。
- `context.composer`: prompt 入力の読み取り、設定、送信、キャンセル、添付、クリア。
- `context.session`: active session の確認、prompt 投稿、steer、cancel、session event 購読。
- `context.files`: workspace ファイルの検索または読み取り。
- `context.shell`: workspace shell command の実行。

## プラグイン用 core RxJS

pi-web は core に RxJS をインストールし、`context.rxjs` として公開します。プラグイン間で互換性のある
observable、subject、subscription が必要な場合は、別の RxJS コピーを bundle せずこれを使ってください。

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

bundle していないブラウザプラグイン entry では runtime RxJS import を使わないでください。プラグインを bundle
する場合は、`rxjs` を external または `peerDependency` にして、実行時は `context.rxjs` を使ってください。
これにより、プラグインごとに分離された RxJS インスタンスが作られることを避けられます。

RxJS の共有はライブラリインスタンスだけを共有します。実際の状態共有は、同じ `Subject`、`BehaviorSubject`、
または observable オブジェクトを plugin context、host API、明示的な bridge で渡した場合のみ発生します。

## 任意の backend スクリプト

任意の backend スクリプトは必要に応じてローカルで実行されます。JavaScript backend は Node で実行され、Go
backend は自動的に build/cache されます。スクリプトは `method` と `workspaceRoot` 引数を受け取り、stdin から
`data` JSON を読み、stdout に有効な JSON を出力する必要があります。

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
