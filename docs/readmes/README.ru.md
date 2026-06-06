<h1 align="center">pi-web</h1>

<div align="center">

[English](../../README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](../assets/pi-web.png)

| Десктоп |
| --- |
| ![UI сессии рабочего пространства](../assets/screenshot.png) |

| Планшет | Мобильный |
| --- | --- |
| ![UI рабочего пространства на планшете](../assets/tablet.webp) | ![UI дерева файлов на мобильном](../assets/mobile.webp) |

</div>

## Установка

Установите последний бинарный файл из GitHub Release:

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

Установщик и `pi-web update` устанавливают доверенные плагины по умолчанию, когда локально не установлен ни один плагин: toast-уведомления, файловый браузер, Git viewer, боковую панель, композер чата, уведомления Discord и Telegram. Задайте `PI_WEB_INSTALL_DEFAULT_PLUGINS=never`, чтобы пропустить их, или `always`, чтобы переустановить.

Обновите установленный бинарный файл:

```bash
pi-web update
```

Запустите после установки:

```bash
pi-web
# Слушает 0.0.0.0:8732. Откройте http://127.0.0.1:8732

pi-web --port 9999
# Откройте http://127.0.0.1:9999
```

## Введение

Веб-интерфейс для просмотра и управления локальным агентом кодирования `pi` в браузере.
Он объединяет фронтенд на Astro и бэкенд на Go в один исполняемый файл, чтобы запускать UI рабочих пространств/сессий в локальном браузере без настройки отдельного сервера.

## Возможности

- **Управление рабочими пространствами**: Открывайте локальные папки, переключайтесь между недавними рабочими пространствами, удаляйте сохранённые рабочие пространства и клонируйте Git-репозитории перед открытием.
- **UI сессий**: Просматривайте сессии рабочего пространства, создавайте/переименовывайте/удаляйте сессии, продолжайте прошлые разговоры и получайте потоковые prompt/response в реальном времени.
- **Управление prompt**: Отправляйте prompt с несколькими вложениями, храните черновики по сессиям, отменяйте или steer активные запуски и отвечайте на pi fallback choice prompt прямо в интерфейсе.
- **Отрисовка transcript**: Отображайте Markdown, код с подсветкой синтаксиса, вывод инструментов, потоковые design deck и длинные transcript с виртуализацией.
- **Просмотр и редактирование файлов**: Навигируйте по дереву файлов рабочего пространства с иконками Material Icon Theme, ищите файлы, просматривайте поддерживаемые форматы, создавайте/переименовывайте/удаляйте/загружайте файлы, редактируйте текстовые файлы и сохраняйте изменения из UI.
- **Git-информация**: Просматривайте Git-статус рабочего пространства, декорации файлов, историю коммитов и детали отдельных коммитов.
- **Локальное выполнение команд**: Запускайте shell-команды в выбранном рабочем пространстве и просматривайте историю/результаты команд.
- **Настройки и аутентификация**: Управляйте проектными/глобальными настройками pi, API-ключами, OAuth-входом для подписок Claude/Codex/Copilot, runtime-настройками модели/мышления и проверками quota/status.
- **Голос и уведомления**: Озвучивайте ответы, используйте браузерную или локальную Whisper-транскрипцию речи и настраивайте уведомления о завершении через Discord/Telegram.
- **Интернационализированный UI**: Переключайте интерфейс браузера между английским, корейским, китайским, японским, испанским, португальским, французским, русским и немецким.
- **AG-UI bridge**: Открывает запуски сессий через совместимый с AG-UI SSE endpoint для клиентских интеграций.
- **Plugins (in development)**: Load trusted local/GitHub JavaScript plugins that extend UI through stable DOM hooks
  and share state through `piWeb` RxJS subjects.
- **Один исполняемый файл**: Распространяет статическую сборку Astro, встроенную в Go-бинарник, со встроенной поддержкой обновлений.


## Plugins (in development)

Plugins are trusted local code. pi-web core stays small: it loads plugins, exposes the `piWeb` shared RxJS Subject
registry, and documents stable names for cross-plugin state and DOM extension points.

Install plugins from **Settings → Plugins** with either a local folder path or a GitHub `owner/repo` value. A plugin folder
must contain `plugin.json` and the JavaScript file named by `entry`.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js"
}
```

```js
export function activate() {
  const panel = document.createElement("section");
  panel.textContent = "Hello from hello-panel";
  document.querySelector("[data-main]")?.append(panel);

  return () => panel.remove();
}
```

Core plugin standards:

- Current version: `piWeb.version`.
- Shared Subject registry: `piWeb.subject(...)`, `piWeb.behaviorSubject(...)`, `piWeb.replaySubject(...)`,
  `piWeb.asyncSubject(...)`.
- Channel names: `core.*`, `chat.*`, `session.*`, `shortcut.*`, `toast.*`, and `plugin.<pluginId>.*`.
- DOM hooks: `[data-plugin-toolbar]`, `[data-plugin-settings-root]`, and `.main[data-main]`.

See [Plugin development](../plugins/README.md) for the plugin standard.
