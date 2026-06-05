# 插件

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

插件是实验性功能，适用于可信的本地代码。API 在稳定前可能会变化。

## 文件夹结构

插件文件夹必须包含 `plugin.json` 和入口模块。TypeScript 插件应被打包或编译成 `entry` 指向的 JavaScript 文件。

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` 是必需的，`backend` 是可选的。两个路径都必须位于插件文件夹内。

## 入口模块

入口模块可以导出 `activate(context)` 或 `default(context)`。返回函数，或返回带有 `deactivate()` / `dispose()`
的对象，可让 pi-web 在重新加载、禁用或卸载时清理插件。也支持模块级 `deactivate(context)` 导出。

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

## 插件 context

- `context.app`：`<pi-app>` 元素。
- `context.plugin`：已解析的清单。
- `context.rxjs`：由 pi-web core 提供的 RxJS 命名空间。
- `context.api.get(path)` / `context.api.post(path, body)`：调用 pi-web HTTP API。
- `context.backend(method, { workspaceId, data })`：调用可选 backend 脚本。`workspaceId` 可选，`data` 会成为
  backend 的 stdin JSON。
- `context.mount.chat(element)` / `context.mount.composer(element)`：挂载 chat 或 composer surface。
- `context.chat`：追加、流式写入、渲染、结束并滚动 transcript 消息。
- `context.composer`：读取、设置、提交、取消、附加或清空 prompt 输入。
- `context.session`：检查 active session，发送 prompt，steer，cancel，或订阅 session events。
- `context.files`：搜索或读取 workspace 文件。
- `context.shell`：运行 workspace shell 命令。

## 插件使用 core RxJS

pi-web 在 core 中安装 RxJS，并通过 `context.rxjs` 暴露。插件需要兼容的 observable、subject 或 subscription 时，
请使用它，而不要打包单独的 RxJS 副本。

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

未打包的浏览器插件 entry 不要导入运行时 RxJS。如果插件会被打包，请将 `rxjs` 保持为 external 或
`peerDependency`，并在运行时使用 `context.rxjs`，避免每个插件创建隔离的 RxJS 实例。

共享 RxJS 只共享库实例。插件只有通过 plugin context、host API 或其他显式 bridge 传递同一个 `Subject`、
`BehaviorSubject` 或 observable 对象时，才会共享状态。

## 可选 backend 脚本

可选 backend 脚本会按需在本地执行。JavaScript backend 使用 Node 运行；Go backend 会自动构建并缓存。脚本接收
`method` 和 `workspaceRoot` 参数，从 stdin 读取 `data` JSON，并且必须向 stdout 输出有效 JSON。

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
