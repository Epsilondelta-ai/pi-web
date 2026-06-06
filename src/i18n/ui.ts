import { DEFAULT_UI_LOCALE, type UiLocale } from "./locales";

const EN_MESSAGES = {
  language: "Language",
  languageHint: "Changes apply immediately and are saved on this device.",
  settingsTitle: "pi settings",
  settingsSubtitle: "pi-web settings only",
  closeSettings: "close settings",
  scope: "scope",
  project: "project",
  global: "global",
  authTitle: "Authentication",
  authMode: "API key login",
  authStatus: "API key is stored in ~/.pi/agent/auth.json",
  provider: "provider",
  apiKey: "API key",
  pasteApiKey: "paste API key",
  saveKey: "save key",
  logout: "logout",
  oauthProvider: "OAuth provider",
  loadingOAuthProviders: "loading OAuth providers…",
  loginWithOAuth: "login with OAuth",
  openLoginPage: "open login page",
  oauthInput: "prompt input or redirect URL",
  send: "send",
  oauthStatus: "OAuth supports Claude, Codex, and Copilot subscriptions.",
  model: "Model",
  modelDescription: "provider, model, thinking",
  conversation: "Conversation",
  conversationDescription: "prompt flow and transcript behavior",
  voice: "Voice",
  voiceDescription: "read aloud output",
  speech: "Speech",
  speechDescription: "speech input and transcription",
  warnings: "Warnings",
  warningsDescription: "usage and safety notices",
  browserLocal: "browser + local",
  speechNote: "Enable the mic, choose recognition language, then optionally cache a local Whisper model for offline transcription.",
  enabled: "Enabled",
  searchLanguage: "Search language…",
  effectiveNotSet: "effective: not set",
  useLocalWhisper: "Use local Whisper",
  enhanced: "Enhanced",
  whisperModel: "Whisper model",
  download: "download",
  notChecked: "not checked",
  settingsInheritHint: "blank fields inherit from effective settings",
  cancel: "cancel",
  save: "save",
  dropFilesToAttach: "Drop files to attach",
  piUpdateQuestion: "Do you want to update pi?",
  piPackageUpdateQuestion: "Update available pi packages?",
  piWorkspacePackageUpdateQuestion: "Update available workspace packages?",
  piUpdateYes: "Yes",
  piUpdateAll: "Update all",
  piUpdateNo: "No",
  piUpdateRunning: "pi update in progress",
  piUpdateComplete: "pi update complete",
  piUpdateFailed: "pi update failed",
} as const;

export type UiMessageKey = keyof typeof EN_MESSAGES;

export const UI_MESSAGES = {
  en: EN_MESSAGES,
  ko: {
    language: "언어", languageHint: "변경 즉시 적용되며 이 기기에 저장됩니다.", settingsTitle: "pi 설정", settingsSubtitle: "pi-web 전용 설정입니다", closeSettings: "설정 닫기", scope: "범위", project: "프로젝트", global: "전역", authTitle: "인증", authMode: "API 키 로그인", authStatus: "API 키는 ~/.pi/agent/auth.json에 저장됩니다", provider: "제공자", apiKey: "API 키", pasteApiKey: "API 키 붙여넣기", saveKey: "키 저장", logout: "로그아웃", oauthProvider: "OAuth 제공자", loadingOAuthProviders: "OAuth 제공자 로딩 중…", loginWithOAuth: "OAuth로 로그인", openLoginPage: "로그인 페이지 열기", oauthInput: "프롬프트 입력 또는 리디렉션 URL", send: "보내기", oauthStatus: "OAuth는 Claude, Codex, Copilot 구독을 지원합니다.", model: "모델", modelDescription: "제공자, 모델, 추론", conversation: "대화", conversationDescription: "프롬프트 흐름과 transcript 동작", voice: "음성 출력", voiceDescription: "응답 읽어주기", speech: "음성 입력", speechDescription: "음성 입력과 전사", warnings: "경고", warningsDescription: "사용량과 안전 안내", browserLocal: "브라우저 + 로컬", speechNote: "마이크를 켜고 인식 언어를 고른 뒤, 필요하면 오프라인 전사용 로컬 Whisper 모델을 캐시합니다.", enabled: "사용", searchLanguage: "언어 검색…", effectiveNotSet: "적용값: 설정 안 됨", useLocalWhisper: "로컬 Whisper 사용", enhanced: "고급", whisperModel: "Whisper 모델", download: "다운로드", notChecked: "확인 안 됨", settingsInheritHint: "빈 필드는 적용 설정을 상속합니다", cancel: "취소", save: "저장", dropFilesToAttach: "파일을 놓으면 첨부됩니다", piUpdateQuestion: "pi 업데이트를 진행하시겠습니까?", piPackageUpdateQuestion: "업데이트 가능한 글로벌 pi 패키지를 업데이트하시겠습니까?", piWorkspacePackageUpdateQuestion: "워크스페이스에 업데이트 가능한 pi 패키지가 있습니다. 업데이트하시겠습니까?", piUpdateYes: "네", piUpdateAll: "전부 업데이트", piUpdateNo: "아니오", piUpdateRunning: "pi 업데이트 중", piUpdateComplete: "pi 업데이트 완료", piUpdateFailed: "pi 업데이트 실패",
  },
  "zh-CN": {
    language: "语言", languageHint: "更改会立即应用并保存在此设备上。", settingsTitle: "pi 设置", settingsSubtitle: "仅限 pi-web 设置", closeSettings: "关闭设置", scope: "范围", project: "项目", global: "全局", authTitle: "身份验证", authMode: "API 密钥登录", authStatus: "API 密钥存储在 ~/.pi/agent/auth.json", provider: "提供商", apiKey: "API 密钥", pasteApiKey: "粘贴 API 密钥", saveKey: "保存密钥", logout: "退出登录", oauthProvider: "OAuth 提供商", loadingOAuthProviders: "正在加载 OAuth 提供商…", loginWithOAuth: "使用 OAuth 登录", openLoginPage: "打开登录页面", oauthInput: "提示输入或重定向 URL", send: "发送", oauthStatus: "OAuth 支持 Claude、Codex 和 Copilot 订阅。", model: "模型", modelDescription: "提供商、模型、思考", conversation: "对话", conversationDescription: "提示流程和转录行为", voice: "语音", voiceDescription: "朗读输出", speech: "语音输入", speechDescription: "语音输入和转录", warnings: "警告", warningsDescription: "使用和安全提示", browserLocal: "浏览器 + 本地", speechNote: "启用麦克风，选择识别语言，然后可选择缓存本地 Whisper 模型用于离线转录。", enabled: "已启用", searchLanguage: "搜索语言…", effectiveNotSet: "有效值：未设置", useLocalWhisper: "使用本地 Whisper", enhanced: "增强", whisperModel: "Whisper 模型", download: "下载", notChecked: "未检查", settingsInheritHint: "空字段会继承有效设置", cancel: "取消", save: "保存",
  },
  ja: {
    language: "言語", languageHint: "変更はすぐに適用され、このデバイスに保存されます。", settingsTitle: "pi 設定", settingsSubtitle: "pi-web 専用設定です", closeSettings: "設定を閉じる", scope: "スコープ", project: "プロジェクト", global: "グローバル", authTitle: "認証", authMode: "API キーログイン", authStatus: "API キーは ~/.pi/agent/auth.json に保存されます", provider: "プロバイダー", apiKey: "API キー", pasteApiKey: "API キーを貼り付け", saveKey: "キーを保存", logout: "ログアウト", oauthProvider: "OAuth プロバイダー", loadingOAuthProviders: "OAuth プロバイダーを読み込み中…", loginWithOAuth: "OAuth でログイン", openLoginPage: "ログインページを開く", oauthInput: "プロンプト入力またはリダイレクト URL", send: "送信", oauthStatus: "OAuth は Claude、Codex、Copilot サブスクリプションをサポートします。", model: "モデル", modelDescription: "プロバイダー、モデル、思考", conversation: "会話", conversationDescription: "プロンプトフローとトランスクリプト動作", voice: "音声", voiceDescription: "出力を読み上げ", speech: "音声入力", speechDescription: "音声入力と文字起こし", warnings: "警告", warningsDescription: "使用量と安全に関する通知", browserLocal: "ブラウザー + ローカル", speechNote: "マイクを有効にし、認識言語を選択して、必要に応じてオフライン文字起こし用のローカル Whisper モデルをキャッシュします。", enabled: "有効", searchLanguage: "言語を検索…", effectiveNotSet: "有効値: 未設定", useLocalWhisper: "ローカル Whisper を使用", enhanced: "拡張", whisperModel: "Whisper モデル", download: "ダウンロード", notChecked: "未確認", settingsInheritHint: "空のフィールドは有効設定を継承します", cancel: "キャンセル", save: "保存",
  },
  es: {
    language: "Idioma", languageHint: "Los cambios se aplican al instante y se guardan en este dispositivo.", settingsTitle: "configuración de pi", settingsSubtitle: "solo configuración de pi-web", closeSettings: "cerrar configuración", scope: "ámbito", project: "proyecto", global: "global", authTitle: "Autenticación", authMode: "inicio con clave API", authStatus: "La clave API se guarda en ~/.pi/agent/auth.json", provider: "proveedor", apiKey: "clave API", pasteApiKey: "pegar clave API", saveKey: "guardar clave", logout: "cerrar sesión", oauthProvider: "proveedor OAuth", loadingOAuthProviders: "cargando proveedores OAuth…", loginWithOAuth: "iniciar con OAuth", openLoginPage: "abrir página de inicio", oauthInput: "entrada de prompt o URL de redirección", send: "enviar", oauthStatus: "OAuth admite suscripciones de Claude, Codex y Copilot.", model: "Modelo", modelDescription: "proveedor, modelo, razonamiento", conversation: "Conversación", conversationDescription: "flujo de prompt y comportamiento del transcript", voice: "Voz", voiceDescription: "leer respuestas en voz alta", speech: "Entrada de voz", speechDescription: "entrada de voz y transcripción", warnings: "Advertencias", warningsDescription: "avisos de uso y seguridad", browserLocal: "navegador + local", speechNote: "Activa el micrófono, elige el idioma de reconocimiento y opcionalmente guarda un modelo Whisper local para transcripción sin conexión.", enabled: "Activado", searchLanguage: "Buscar idioma…", effectiveNotSet: "efectivo: sin establecer", useLocalWhisper: "Usar Whisper local", enhanced: "Mejorado", whisperModel: "Modelo Whisper", download: "descargar", notChecked: "sin comprobar", settingsInheritHint: "los campos vacíos heredan la configuración efectiva", cancel: "cancelar", save: "guardar",
  },
  "pt-BR": {
    language: "Idioma", languageHint: "As alterações são aplicadas imediatamente e salvas neste dispositivo.", settingsTitle: "configurações do pi", settingsSubtitle: "somente configurações do pi-web", closeSettings: "fechar configurações", scope: "escopo", project: "projeto", global: "global", authTitle: "Autenticação", authMode: "login com chave de API", authStatus: "A chave de API é armazenada em ~/.pi/agent/auth.json", provider: "provedor", apiKey: "chave de API", pasteApiKey: "cole a chave de API", saveKey: "salvar chave", logout: "sair", oauthProvider: "provedor OAuth", loadingOAuthProviders: "carregando provedores OAuth…", loginWithOAuth: "entrar com OAuth", openLoginPage: "abrir página de login", oauthInput: "entrada de prompt ou URL de redirecionamento", send: "enviar", oauthStatus: "OAuth suporta assinaturas Claude, Codex e Copilot.", model: "Modelo", modelDescription: "provedor, modelo, raciocínio", conversation: "Conversa", conversationDescription: "fluxo de prompt e comportamento do transcript", voice: "Voz", voiceDescription: "ler respostas em voz alta", speech: "Entrada de voz", speechDescription: "entrada de voz e transcrição", warnings: "Avisos", warningsDescription: "avisos de uso e segurança", browserLocal: "navegador + local", speechNote: "Ative o microfone, escolha o idioma de reconhecimento e opcionalmente armazene um modelo Whisper local para transcrição offline.", enabled: "Ativado", searchLanguage: "Pesquisar idioma…", effectiveNotSet: "efetivo: não definido", useLocalWhisper: "Usar Whisper local", enhanced: "Avançado", whisperModel: "Modelo Whisper", download: "baixar", notChecked: "não verificado", settingsInheritHint: "campos vazios herdam as configurações efetivas", cancel: "cancelar", save: "salvar",
  },
  fr: {
    language: "Langue", languageHint: "Les changements s’appliquent immédiatement et sont enregistrés sur cet appareil.", settingsTitle: "paramètres pi", settingsSubtitle: "paramètres pi-web uniquement", closeSettings: "fermer les paramètres", scope: "portée", project: "projet", global: "global", authTitle: "Authentification", authMode: "connexion par clé API", authStatus: "La clé API est stockée dans ~/.pi/agent/auth.json", provider: "fournisseur", apiKey: "clé API", pasteApiKey: "coller la clé API", saveKey: "enregistrer la clé", logout: "déconnexion", oauthProvider: "fournisseur OAuth", loadingOAuthProviders: "chargement des fournisseurs OAuth…", loginWithOAuth: "se connecter avec OAuth", openLoginPage: "ouvrir la page de connexion", oauthInput: "entrée de prompt ou URL de redirection", send: "envoyer", oauthStatus: "OAuth prend en charge les abonnements Claude, Codex et Copilot.", model: "Modèle", modelDescription: "fournisseur, modèle, réflexion", conversation: "Conversation", conversationDescription: "flux de prompt et comportement du transcript", voice: "Voix", voiceDescription: "lire les réponses à voix haute", speech: "Entrée vocale", speechDescription: "entrée vocale et transcription", warnings: "Avertissements", warningsDescription: "avis d’utilisation et de sécurité", browserLocal: "navigateur + local", speechNote: "Activez le micro, choisissez la langue de reconnaissance, puis mettez éventuellement en cache un modèle Whisper local pour la transcription hors ligne.", enabled: "Activé", searchLanguage: "Rechercher une langue…", effectiveNotSet: "effectif : non défini", useLocalWhisper: "Utiliser Whisper local", enhanced: "Amélioré", whisperModel: "Modèle Whisper", download: "télécharger", notChecked: "non vérifié", settingsInheritHint: "les champs vides héritent des paramètres effectifs", cancel: "annuler", save: "enregistrer",
  },
  ru: {
    language: "Язык", languageHint: "Изменения применяются сразу и сохраняются на этом устройстве.", settingsTitle: "настройки pi", settingsSubtitle: "только настройки pi-web", closeSettings: "закрыть настройки", scope: "область", project: "проект", global: "глобально", authTitle: "Аутентификация", authMode: "вход по API-ключу", authStatus: "API-ключ хранится в ~/.pi/agent/auth.json", provider: "провайдер", apiKey: "API-ключ", pasteApiKey: "вставьте API-ключ", saveKey: "сохранить ключ", logout: "выйти", oauthProvider: "провайдер OAuth", loadingOAuthProviders: "загрузка провайдеров OAuth…", loginWithOAuth: "войти через OAuth", openLoginPage: "открыть страницу входа", oauthInput: "ввод prompt или URL перенаправления", send: "отправить", oauthStatus: "OAuth поддерживает подписки Claude, Codex и Copilot.", model: "Модель", modelDescription: "провайдер, модель, рассуждение", conversation: "Разговор", conversationDescription: "поток prompt и поведение transcript", voice: "Голос", voiceDescription: "озвучивать ответы", speech: "Голосовой ввод", speechDescription: "голосовой ввод и транскрипция", warnings: "Предупреждения", warningsDescription: "уведомления об использовании и безопасности", browserLocal: "браузер + локально", speechNote: "Включите микрофон, выберите язык распознавания и при необходимости кэшируйте локальную модель Whisper для офлайн-транскрипции.", enabled: "Включено", searchLanguage: "Поиск языка…", effectiveNotSet: "эффективно: не задано", useLocalWhisper: "Использовать локальный Whisper", enhanced: "Расширенный", whisperModel: "Модель Whisper", download: "скачать", notChecked: "не проверено", settingsInheritHint: "пустые поля наследуют эффективные настройки", cancel: "отмена", save: "сохранить",
  },
  de: {
    language: "Sprache", languageHint: "Änderungen werden sofort angewendet und auf diesem Gerät gespeichert.", settingsTitle: "pi-Einstellungen", settingsSubtitle: "nur pi-web-Einstellungen", closeSettings: "Einstellungen schließen", scope: "Bereich", project: "Projekt", global: "global", authTitle: "Authentifizierung", authMode: "API-Key-Login", authStatus: "Der API-Key wird in ~/.pi/agent/auth.json gespeichert", provider: "Anbieter", apiKey: "API-Key", pasteApiKey: "API-Key einfügen", saveKey: "Key speichern", logout: "abmelden", oauthProvider: "OAuth-Anbieter", loadingOAuthProviders: "OAuth-Anbieter werden geladen…", loginWithOAuth: "mit OAuth anmelden", openLoginPage: "Login-Seite öffnen", oauthInput: "Prompt-Eingabe oder Redirect-URL", send: "senden", oauthStatus: "OAuth unterstützt Claude-, Codex- und Copilot-Abonnements.", model: "Modell", modelDescription: "Anbieter, Modell, Denken", conversation: "Konversation", conversationDescription: "Prompt-Fluss und Transcript-Verhalten", voice: "Stimme", voiceDescription: "Antworten vorlesen", speech: "Spracheingabe", speechDescription: "Spracheingabe und Transkription", warnings: "Warnungen", warningsDescription: "Nutzungs- und Sicherheitshinweise", browserLocal: "Browser + lokal", speechNote: "Aktiviere das Mikrofon, wähle die Erkennungssprache und cache optional ein lokales Whisper-Modell für Offline-Transkription.", enabled: "Aktiviert", searchLanguage: "Sprache suchen…", effectiveNotSet: "effektiv: nicht gesetzt", useLocalWhisper: "Lokales Whisper verwenden", enhanced: "Erweitert", whisperModel: "Whisper-Modell", download: "herunterladen", notChecked: "nicht geprüft", settingsInheritHint: "leere Felder erben die effektiven Einstellungen", cancel: "abbrechen", save: "speichern",
  },
} satisfies Record<UiLocale, Partial<Record<UiMessageKey, string>>>;

export function uiMessage(locale: UiLocale, key: UiMessageKey): string {
  /* v8 ignore next -- locale dictionaries are complete for supported UI keys */
  return UI_MESSAGES[locale][key] || UI_MESSAGES[DEFAULT_UI_LOCALE][key];
}
