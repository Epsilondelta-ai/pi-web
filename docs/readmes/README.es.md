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

El instalador también instala los plugins de confianza predeterminados: notificaciones toast, explorador de archivos, visor Git y barra lateral. Define `PI_WEB_INSTALL_DEFAULT_PLUGINS=never` para omitirlos.

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
- **Plugins (en desarrollo)**: Carga plugins JavaScript de confianza locales/GitHub para añadir paneles de UI y llamar APIs de pi-web o scripts backend locales.
- **Ejecutable único**: Distribuye la build estática de Astro embebida en un binario Go con soporte de actualización integrado.

## Plugins (en desarrollo)

Los plugins son experimentales y están pensados para código local de confianza. La API aún puede cambiar antes de considerarse estable.

Instala plugins desde **Settings → Plugins** con una ruta local o un valor GitHub `owner/repo`. La carpeta debe contener `plugin.json` y un módulo JavaScript de entrada.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` es obligatorio. `backend` es opcional. Ambas rutas deben permanecer dentro de la carpeta del plugin.

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

El módulo de entrada exporta `activate(context)` o `default(context)`. Si devuelve una función, o un objeto con `deactivate()`/`dispose()`, se limpia durante reload, disable o uninstall. También se admite `deactivate(context)` a nivel de módulo.

El context del plugin incluye:

- `context.app`: el elemento `<pi-app>`.
- `context.plugin`: el manifiesto parseado.
- `context.api.get(path)` / `context.api.post(path, body)`: llamadas a APIs HTTP de pi-web.
- `context.backend(method, { workspaceId, data })`: llamada al backend opcional; `data` es el JSON de stdin.

Los scripts backend opcionales se ejecutan localmente bajo demanda. JavaScript usa Node; Go se compila y cachea automáticamente. El script recibe `method` y `workspaceRoot`, lee JSON desde stdin y debe imprimir JSON válido en stdout.

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
