<h1 align="center">pi-web</h1>

<div align="center">

[English](../../README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](../assets/pi-web.png)

| デスクトップ |
| --- |
| ![ワークスペースセッション UI](../assets/screenshot.png) |

| タブレット | モバイル |
| --- | --- |
| ![タブレットのワークスペース UI](../assets/tablet.webp) | ![モバイルのファイルツリー UI](../assets/mobile.webp) |

</div>

## インストール

最新の GitHub Release バイナリをインストールします。

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

インストーラーと `pi-web update` は、ローカルにインストール済みプラグインがない場合に既定の信頼済みプラグイン（toast 通知、ファイルブラウザー、Git ビューアー、サイドバー、チャットコンポーザー、Discord 通知、Telegram 通知）をインストールします。スキップするには `PI_WEB_INSTALL_DEFAULT_PLUGINS=never`、再インストールするには `always` を設定します。

インストール済みバイナリを更新します。

```bash
pi-web update
```

インストール後に実行します。

```bash
pi-web
# 0.0.0.0:8732 で待ち受けます。http://127.0.0.1:8732 を開いてください

pi-web --port 9999
# http://127.0.0.1:9999 を開いてください
```

## 概要

ブラウザーでローカルの `pi` コーディングエージェントを表示・操作するための Web UI です。
Astro ベースのフロントエンドと Go バックエンドを単一の実行ファイルにまとめているため、別サーバーを設定せずにローカルブラウザーでワークスペース/セッション UI を実行できます。

## 機能

- **ワークスペース管理**: ローカルフォルダーを開き、最近使ったワークスペースを切り替え、保存済みワークスペースを削除し、Git リポジトリをクローンしてから開けます。
- **セッション UI**: ワークスペースのセッションを参照し、セッションの作成/名前変更/削除、過去の会話の再開、プロンプト/応答のリアルタイムストリーミングができます。
- **プロンプト操作**: 複数添付付きのプロンプト送信、セッション別ドラフト保持、実行中タスクのキャンセルや steer、pi fallback choice プロンプトへのインライン回答ができます。
- **トランスクリプト描画**: Markdown、シンタックスハイライト付きコード、ツール出力、ストリーミング design deck、長いトランスクリプトを仮想化して描画します。
- **ファイル閲覧と編集**: Material Icon Theme アイコン付きのワークスペースファイルツリー、ファイル検索、対応形式のプレビュー、ファイルの作成/名前変更/削除/アップロード、テキストファイルの編集と保存を UI で行えます。
- **Git インサイト**: ワークスペースの Git 状態、ファイル装飾、コミット履歴、個別コミット詳細を確認できます。
- **ローカルコマンド実行**: 選択したワークスペースでシェルコマンドを実行し、コマンド履歴と結果を確認できます。
- **設定と認証**: プロジェクト/グローバル pi 設定、API キー、Claude/Codex/Copilot サブスクリプション用 OAuth ログイン、ランタイムモデル/思考設定、quota/status チェックを管理できます。
- **音声と通知**: 応答の読み上げ、ブラウザーまたはローカル Whisper による音声文字起こし、Discord/Telegram 完了通知の設定ができます。
- **国際化 UI**: ブラウザー UI を英語、韓国語、中国語、日本語、スペイン語、ポルトガル語、フランス語、ロシア語、ドイツ語に切り替えられます。
- **AG-UI ブリッジ**: クライアント統合向けに、AG-UI 互換の SSE エンドポイントでセッション実行を公開します。
- **Plugins (in development)**: Load trusted local/GitHub JavaScript plugins that extend UI through stable DOM hooks
  and share state through `piWeb` RxJS subjects.
- **単一実行ファイル**: Astro の静的ビルドを Go バイナリに埋め込んで配布し、組み込み更新をサポートします。


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
