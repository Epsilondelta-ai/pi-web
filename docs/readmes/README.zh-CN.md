<h1 align="center">pi-web</h1>

<div align="center">

[English](../../README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](../assets/pi-web.png)

| 桌面端 |
| --- |
| ![工作区会话 UI](../assets/screenshot.png) |

| 平板 | 移动端 |
| --- | --- |
| ![平板工作区 UI](../assets/tablet.webp) | ![移动端文件树 UI](../assets/mobile.webp) |

</div>

## 安装

安装最新的 GitHub Release 二进制文件：

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

安装器和 `pi-web update` 会在本地没有已安装插件时安装默认可信插件：toast 通知、文件浏览器、Git 查看器、侧边栏、聊天输入器、Discord 通知和 Telegram 通知。设置 `PI_WEB_INSTALL_DEFAULT_PLUGINS=never` 可跳过，设置为 `always` 可重新安装。

更新已安装的二进制文件：

```bash
pi-web update
```

安装后运行：

```bash
pi-web
# 监听 0.0.0.0:8732。打开 http://127.0.0.1:8732

pi-web --port 9999
# 打开 http://127.0.0.1:9999
```

## 简介

一个用于在浏览器中查看和控制本地 `pi` 编码代理的 Web UI。
它将基于 Astro 的前端和 Go 后端打包成单个可执行文件，因此无需配置单独服务器，即可在本地浏览器中运行工作区/会话 UI。

## 功能

- **工作区管理**：打开本地文件夹，切换最近工作区，删除已保存工作区，并在克隆 Git 仓库后打开它们。
- **会话 UI**：浏览工作区会话，创建/重命名/删除会话，恢复之前的对话，并实时流式显示提示和响应。
- **提示控制**：发送带多个附件的提示，保留每个会话的草稿，取消或 steer 正在运行的任务，并在界面内回答 pi fallback choice 提示。
- **转录渲染**：渲染 Markdown、语法高亮代码、工具输出、流式 design deck，并通过虚拟化处理长转录内容。
- **文件浏览和编辑**：使用 Material Icon Theme 图标浏览工作区文件树，搜索文件，预览支持的格式，创建/重命名/删除/上传文件，并在 UI 中编辑和保存文本文件。
- **Git 洞察**：查看工作区 Git 状态、文件标记、提交历史和单个提交详情。
- **本地命令执行**：在所选工作区运行 shell 命令，并查看命令历史和结果。
- **设置和认证**：管理项目/全局 pi 设置、API 密钥、Claude/Codex/Copilot 订阅的 OAuth 登录、运行时模型/思考设置，以及配额/状态检查。
- **语音和通知**：朗读响应，使用浏览器或本地 Whisper 语音转录，并配置 Discord/Telegram 完成通知。
- **国际化 UI**：在英语、韩语、中文、日语、西班牙语、葡萄牙语、法语、俄语和德语之间切换浏览器 UI。
- **AG-UI 桥接**：通过 AG-UI 兼容的 SSE 端点暴露会话运行，供客户端集成使用。
- **插件（开发中）**：通过可信的本地/GitHub JavaScript 插件添加 UI 面板，并调用 pi-web API 或本地后端脚本。
- **单个可执行文件**：将 Astro 静态构建嵌入 Go 二进制文件发布，并支持内置更新。

## 插件（开发中）

插件仍是实验性功能，面向可信的本地代码。在被视为稳定功能之前，API 仍可能变化。

在 **Settings → Plugins** 中通过本地文件夹路径或 GitHub `owner/repo` 安装。插件文件夹必须包含 `plugin.json` 和入口 JavaScript 模块。

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` 必填，`backend` 可选。两个路径都必须位于插件文件夹内。

```js
export function activate(context) {
  const panel = document.createElement("section");
  panel.dataset.pluginPanel = context.plugin.id;
  panel.textContent = `Hello from ${context.plugin.name}`;
  context.app.querySelector("[data-plugin-sidebar]")?.append(panel);

  return () => {
    panel.remove();
  };
}
```

入口模块导出 `activate(context)` 或 `default(context)`。返回函数，或返回带 `deactivate()`/`dispose()` 的对象，可在 reload、disable、uninstall 时清理插件。也支持模块级 `deactivate(context)`。

插件 context 包含：

- `context.app`：`<pi-app>` 元素。
- `context.plugin`：解析后的清单。
- `context.rxjs`：由 pi-web core 提供的 RxJS 命名空间。
- `context.api.get(path)` / `context.api.post(path, body)`：调用 pi-web HTTP API。
- `context.backend(method, { workspaceId, data })`：调用可选后端；`data` 是 stdin JSON。

完整插件 API 和 core RxJS 用法见 [Plugin development](../plugins.zh-CN.md)。

可选 backend 脚本在本地按需执行。JavaScript 使用 Node；Go 会自动构建并缓存。脚本接收 `method`、`workspaceRoot` 参数，从 stdin 读取 JSON，并向 stdout 输出有效 JSON。

```js
const [, , method, workspaceRoot] = process.argv;
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  console.log(JSON.stringify({ method, workspaceRoot, received: JSON.parse(input || "{}") }));
});
```
