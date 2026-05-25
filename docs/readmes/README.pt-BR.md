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
- **Executável único**: Distribui a build estática do Astro embutida em um binário Go com suporte integrado a atualização.
