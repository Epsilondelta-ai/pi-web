<h1 align="center">pi-web</h1>

<div align="center">

[English](../../README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](../assets/pi-web.png)

| Escritorio |
| --- |
| ![UI de sesión del espacio de trabajo](../assets/screenshot.png) |

| Tablet | Móvil |
| --- | --- |
| ![UI de espacio de trabajo en tablet](../assets/tablet.webp) | ![UI de árbol de archivos en móvil](../assets/mobile.webp) |

</div>

## Instalación

Instala el binario más reciente desde GitHub Releases:

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

El instalador y `pi-web update` instalan los plugins de confianza predeterminados cuando no hay plugins locales instalados: notificaciones toast, explorador de archivos, visor Git, barra lateral, compositor de chat, notificaciones de Discord y notificaciones de Telegram. Define `PI_WEB_INSTALL_DEFAULT_PLUGINS=never` para omitirlos o `always` para reinstalarlos.

Actualiza el binario instalado:

```bash
pi-web update
```

Ejecuta después de instalar:

```bash
pi-web
# Escucha en 0.0.0.0:8732. Abre http://127.0.0.1:8732

pi-web --port 9999
# Abre http://127.0.0.1:9999
```

## Introducción

Una UI web para ver y controlar el agente de programación local `pi` desde el navegador.
Agrupa un frontend basado en Astro y un backend en Go en un único ejecutable, para ejecutar la UI de espacios de trabajo y sesiones en un navegador local sin configurar un servidor aparte.

## Funciones

- **Gestión de espacios de trabajo**: Abre carpetas locales, cambia entre espacios recientes, elimina espacios guardados y clona repositorios Git antes de abrirlos.
- **UI de sesiones**: Explora sesiones del espacio de trabajo, crea/renombra/elimina sesiones, reanuda conversaciones anteriores y transmite prompts/respuestas en tiempo real.
- **Controles de prompt**: Envía prompts con varios adjuntos, conserva borradores por sesión, cancela o steer ejecuciones activas y responde prompts pi fallback choice en línea.
- **Renderizado de transcript**: Renderiza Markdown, código con resaltado de sintaxis, salida de herramientas, design decks en streaming y transcripts largos con virtualización.
- **Exploración y edición de archivos**: Navega el árbol de archivos con iconos de Material Icon Theme, busca archivos, previsualiza formatos admitidos, crea/renombra/elimina/sube archivos, edita archivos de texto y guarda cambios desde la UI.
- **Información de Git**: Consulta el estado Git del espacio de trabajo, decoraciones de archivos, historial de commits y detalles de commits individuales.
- **Ejecución de comandos locales**: Ejecuta comandos shell en el espacio de trabajo seleccionado e inspecciona el historial/resultados.
- **Configuración y autenticación**: Gestiona ajustes pi de proyecto/globales, claves API, inicio OAuth para suscripciones Claude/Codex/Copilot, ajustes de modelo/razonamiento en tiempo de ejecución y comprobaciones de cuota/estado.
- **Voz y notificaciones**: Lee respuestas en voz alta, usa transcripción de voz del navegador o Whisper local y configura notificaciones de finalización en Discord/Telegram.
- **UI internacionalizada**: Cambia la UI del navegador entre inglés, coreano, chino, japonés, español, portugués, francés, ruso y alemán.
- **Puente AG-UI**: Expone ejecuciones de sesión mediante un endpoint SSE compatible con AG-UI para integraciones de clientes.
- **Plugins (in development)**: Load trusted local/GitHub JavaScript plugins that extend UI through stable DOM hooks
  and share state through `piWeb` RxJS subjects.
- **Ejecutable único**: Distribuye la build estática de Astro embebida en un binario Go con soporte de actualización integrado.


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

- Shared Subject registry: `piWeb.subject(...)`, `piWeb.behaviorSubject(...)`, `piWeb.replaySubject(...)`,
  `piWeb.asyncSubject(...)`.
- Channel names: `core.*`, `chat.*`, `session.*`, `shortcut.*`, `toast.*`, and `plugin.<pluginId>.*`.
- DOM hooks: `[data-plugin-toolbar]`, `[data-plugin-settings-root]`, and `.main[data-main]`.

See [Plugin development](../plugins/README.md) for the plugin standard.
