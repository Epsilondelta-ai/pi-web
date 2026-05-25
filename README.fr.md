<h1 align="center">pi-web</h1>

<div align="center">

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](./docs/assets/pi-web.png)

| Bureau |
| --- |
| ![UI de session d’espace de travail](docs/assets/screenshot.png) |

| Tablette | Mobile |
| --- | --- |
| ![UI d’espace de travail sur tablette](docs/assets/tablet.webp) | ![UI d’arborescence de fichiers sur mobile](docs/assets/mobile.webp) |

</div>

## Installation

Installez le dernier binaire GitHub Release :

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

Mettez à jour le binaire installé :

```bash
pi-web update
```

Lancez après l’installation :

```bash
pi-web
# Écoute sur 0.0.0.0:8732. Ouvrez http://127.0.0.1:8732

pi-web --port 9999
# Ouvrez http://127.0.0.1:9999
```

## Introduction

Une UI web pour afficher et contrôler l’agent de codage local `pi` dans votre navigateur.
Elle regroupe un frontend basé sur Astro et un backend Go dans un seul exécutable, afin de lancer l’UI workspace/session dans un navigateur local sans configurer de serveur séparé.

## Fonctionnalités

- **Gestion des workspaces** : Ouvrez des dossiers locaux, passez d’un workspace récent à l’autre, supprimez les workspaces enregistrés et clonez des dépôts Git avant de les ouvrir.
- **UI de sessions** : Parcourez les sessions du workspace, créez/renommez/supprimez des sessions, reprenez des conversations précédentes et diffusez prompts/réponses en temps réel.
- **Contrôles de prompt** : Envoyez des prompts avec plusieurs pièces jointes, conservez des brouillons par session, annulez ou steer les exécutions actives et répondez en ligne aux prompts pi fallback choice.
- **Rendu du transcript** : Affichez Markdown, code avec coloration syntaxique, sorties d’outils, design decks en streaming et longs transcripts avec virtualisation.
- **Navigation et édition de fichiers** : Parcourez l’arborescence avec les icônes Material Icon Theme, recherchez des fichiers, prévisualisez les formats pris en charge, créez/renommez/supprimez/téléversez des fichiers, modifiez des fichiers texte et enregistrez les changements depuis l’UI.
- **Aperçu Git** : Consultez l’état Git du workspace, les décorations de fichiers, l’historique des commits et les détails de chaque commit.
- **Exécution de commandes locales** : Exécutez des commandes shell dans le workspace sélectionné et inspectez l’historique/résultats.
- **Paramètres et authentification** : Gérez les paramètres pi de projet/globaux, les clés API, la connexion OAuth pour les abonnements Claude/Codex/Copilot, les paramètres runtime de modèle/réflexion et les contrôles de quota/état.
- **Voix et notifications** : Lisez les réponses à voix haute, utilisez la transcription vocale du navigateur ou Whisper local et configurez les notifications de fin via Discord/Telegram.
- **UI internationalisée** : Basculez l’UI du navigateur entre anglais, coréen, chinois, japonais, espagnol, portugais, français, russe et allemand.
- **Pont AG-UI** : Expose les exécutions de session via un endpoint SSE compatible AG-UI pour les intégrations clientes.
- **Exécutable unique** : Distribue le build statique Astro intégré dans un binaire Go avec prise en charge de la mise à jour intégrée.
