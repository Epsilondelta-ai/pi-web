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
- **单个可执行文件**：将 Astro 静态构建嵌入 Go 二进制文件发布，并支持内置更新。
