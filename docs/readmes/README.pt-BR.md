<h1 align="center">pi-web</h1>

<div align="center">

[English](../../README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](../assets/pi-web.png)

| Desktop |
| --- |
| ![UI de sessão do workspace](../assets/screenshot.png) |

| Tablet | Celular |
| --- | --- |
| ![UI de workspace no tablet](../assets/tablet.webp) | ![UI de árvore de arquivos no celular](../assets/mobile.webp) |

</div>

## Instalação

Instale o binário mais recente do GitHub Releases:

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

O instalador também instala os plugins confiáveis padrão: notificações toast, navegador de arquivos e visualizador Git. Defina `PI_WEB_INSTALL_DEFAULT_PLUGINS=never` para ignorá-los.

Atualize o binário instalado:

```bash
pi-web update
```

Execute após a instalação:

```bash
pi-web
# Escuta em 0.0.0.0:8732. Abra http://127.0.0.1:8732

pi-web --port 9999
# Abra http://127.0.0.1:9999
```

## Introdução

Uma UI web para visualizar e controlar o agente de programação local `pi` no navegador.
Ela empacota um frontend baseado em Astro e um backend em Go em um único executável, permitindo rodar a UI de workspace/sessão em um navegador local sem configurar um servidor separado.

## Recursos

- **Gerenciamento de workspaces**: Abra pastas locais, alterne entre workspaces recentes, exclua workspaces salvos e clone repositórios Git antes de abri-los.
- **UI de sessões**: Navegue por sessões do workspace, crie/renomeie/exclua sessões, retome conversas anteriores e transmita prompts/respostas em tempo real.
- **Controles de prompt**: Envie prompts com vários anexos, mantenha rascunhos por sessão, cancele ou steer execuções ativas e responda prompts pi fallback choice em linha.
- **Renderização do transcript**: Renderize Markdown, código com destaque de sintaxe, saída de ferramentas, design decks em streaming e transcripts longos com virtualização.
- **Navegação e edição de arquivos**: Navegue pela árvore de arquivos com ícones do Material Icon Theme, pesquise arquivos, visualize formatos compatíveis, crie/renomeie/exclua/envie arquivos, edite arquivos de texto e salve alterações pela UI.
- **Insights de Git**: Veja o status Git do workspace, decorações de arquivos, histórico de commits e detalhes de commits individuais.
- **Execução de comandos locais**: Execute comandos shell no workspace selecionado e inspecione histórico/resultados.
- **Configurações e autenticação**: Gerencie configurações pi de projeto/globais, chaves API, login OAuth para assinaturas Claude/Codex/Copilot, configurações de modelo/raciocínio em runtime e verificações de quota/status.
- **Voz e notificações**: Leia respostas em voz alta, use transcrição de voz do navegador ou Whisper local e configure notificações de conclusão no Discord/Telegram.
- **UI internacionalizada**: Alterne a UI do navegador entre inglês, coreano, chinês, japonês, espanhol, português, francês, russo e alemão.
- **Ponte AG-UI**: Expõe execuções de sessão por um endpoint SSE compatível com AG-UI para integrações de clientes.
- **Plugins (em desenvolvimento)**: Carrega plugins JavaScript confiáveis locais/GitHub para adicionar painéis de UI e chamar APIs do pi-web ou scripts backend locais.
- **Executável único**: Distribui a build estática do Astro embutida em um binário Go com suporte integrado a atualização.

## Plugins (em desenvolvimento)

Plugins são experimentais e destinados a código local confiável. A API ainda pode mudar antes de ser considerada estável.

Instale em **Settings → Plugins** usando um caminho local ou um valor GitHub `owner/repo`. A pasta deve conter `plugin.json` e um módulo JavaScript de entrada.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry` é obrigatório. `backend` é opcional. Ambos os caminhos devem permanecer dentro da pasta do plugin.

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

O módulo de entrada exporta `activate(context)` ou `default(context)`. Retornar uma função, ou um objeto com `deactivate()`/`dispose()`, permite limpeza durante reload, disable ou uninstall. `deactivate(context)` no módulo também é suportado.

O context do plugin inclui:

- `context.app`: o elemento `<pi-app>`.
- `context.plugin`: o manifesto analisado.
- `context.api.get(path)` / `context.api.post(path, body)`: chamadas às APIs HTTP do pi-web.
- `context.backend(method, { workspaceId, data })`: chamada ao backend opcional; `data` é o JSON de stdin.
- `context.loadCodeMirrorFileEditor()`: lazy-load do editor de arquivos integrado.

Scripts backend opcionais rodam localmente sob demanda. JavaScript usa Node; Go é compilado e armazenado em cache automaticamente. O script recebe `method` e `workspaceRoot`, lê JSON de stdin e deve imprimir JSON válido em stdout.

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
