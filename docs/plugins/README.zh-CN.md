# 插件

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

插件是可信的本地代码。pi-web 保持 host 精简，只为插件提供 manifest、lifecycle、storage key 命名和共享 RxJS Subject registry 标准。

## 职责划分

Core 只负责全局基础设施。

- 设置标准和设置 storage key。
- 语言标准和语言 storage key。
- 插件安装、加载、重载、禁用、卸载和 cleanup lifecycle。
- 共享 RxJS Subject registry。
- 标准 channel 名称和 payload 契约。

插件负责面向用户的功能。

- 聊天 UI、composer、transcript rendering、prompt submit、附件。
- Session、active session 状态和 session persistence。
- 快捷键和 command 处理。
- Toast 通知。
- 插件自己的 state 和 settings。

Core 不保存聊天 session、不拥有快捷键行为、不渲染 toast UI。这些可以由插件直接实现。

## 文件夹结构

插件文件夹必须包含 `plugin.json` 和 entry module。TypeScript 插件必须 bundle 或 compile 到 `entry` 指向的 JavaScript 文件。

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` 必需，`backend` 可选。两个 path 都必须位于插件文件夹内。

## Entry module

Entry module 可以 export `activate(context)` 或 `default(context)`。返回 function，或返回带有 `deactivate()` / `dispose()` 的
object，pi-web 就会在 reload、disable、uninstall 时 cleanup。也支持 module-level `deactivate(context)` export。

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
- `context.plugin`: 已解析的 manifest。
- `context.piWeb`: pi-web 标准 object，包含共享 Subject registry。
- `context.rxjs`: 兼容用 RxJS namespace。已 bundle 的插件优先直接 import `rxjs`。
- `context.api.get(path)` / `context.api.post(path, body)`: 调用 pi-web HTTP API。
- `context.backend(method, { workspaceId, data })`: 调用可选 backend script。`workspaceId` 可选，`data` 会成为 backend stdin JSON。
- `context.mount.chat(element)` / `context.mount.composer(element)`: mount chat 或 composer surface。
- `context.chat`: append、stream、render、finalize、scroll transcript messages。
- `context.composer`: read、set、submit、cancel、attach、clear prompt input。
- `context.session`: 查看 active process session，post prompt，steer，cancel，或订阅 process events。
- `context.files`: search/read workspace files。
- `context.shell`: 运行 workspace shell command。

## localStorage 标准

插件直接使用浏览器 `localStorage` API。pi-web 不包装 storage。标准只规定 key naming 和 JSON shape。

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

规则：使用 `pi-web:` prefix；plugin key 使用 manifest 的 `plugin.id`；结构化值保存为 JSON；插件可在 `pi-web:plugin:<pluginId>:` 下定义更多 key。

## RxJS 标准

插件直接 import RxJS 的 operators、`Observable`、`Subscription` 和本地 subjects。

```ts
import { filter, map, type Subscription } from "rxjs";
```

pi-web 只提供共享 Subject registry，让插件按名称取得同一个 Subject instance。pi-web 不包装 operators 或 observable composition。

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

Publisher 示例：

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

Subscriber 示例：

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

Registry 规则：同一 `name` 返回同一 Subject instance；同一 name 不能换 Subject kind；`behaviorSubject` 的第一次调用拥有 initial value，之后的
initial value 被忽略；`deleteSubject` 只用于 plugin-owned channels；权限和 read-only policy 不属于本标准。

## 标准 channels

保存 RxJS stream 的变量使用 `$` suffix。Channel name 不包含 `$`。

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

## 命名规则

Core channels 以 `core.` 开头。Feature plugin channels 以 feature name 开头：`chat.`、`session.`、`shortcut.`、`toast.`。Private
plugin channels 以 `plugin.<pluginId>.` 开头。Event channels 使用动词或过去式事件名：`changed`、`submitted`、`received`、`pressed`。State
channels 使用名词：`core.language`、`session.activeId`、`chat.input`。

## Cleanup

插件必须 unsubscribe subscriptions，并移除自己创建的 DOM。Plugin-owned Subjects 可以在 unload 时 complete 或 delete。

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

## 可选 backend scripts

可选 backend scripts 会按需在本地执行。JavaScript backends 使用 Node；Go backends 会自动 build/cache。Script 接收 `method` 和 `workspaceRoot`
参数，从 stdin 读取 `data` JSON，并且必须向 stdout 输出有效 JSON。

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
