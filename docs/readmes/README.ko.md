<h1 align="center">pi-web</h1>

<div align="center">

[English](../../README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Deutsch](README.de.md)

![pi.dev web](../assets/pi-web.png)

| 데스크톱 |
| --- |
| ![워크스페이스 세션 UI](../assets/screenshot.png) |

| 태블릿 | 모바일 |
| --- | --- |
| ![태블릿 워크스페이스 UI](../assets/tablet.webp) | ![모바일 파일 트리 UI](../assets/mobile.webp) |

</div>

## 설치

최신 GitHub 릴리스 바이너리를 설치합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
```

설치 프로그램은 기본 신뢰 플러그인인 toast 알림, 파일 브라우저, Git 뷰어, 사이드바, 채팅 컴포저도 설치합니다. 건너뛰려면 `PI_WEB_INSTALL_DEFAULT_PLUGINS=never`를 설정하세요.

설치된 바이너리를 업데이트합니다.

```bash
pi-web update
```

설치 후 실행합니다.

```bash
pi-web
# 0.0.0.0:8732에서 수신합니다. http://127.0.0.1:8732 를 여세요

pi-web --port 9999
# http://127.0.0.1:9999 를 여세요
```

## 소개

브라우저에서 로컬 `pi` 코딩 에이전트를 보고 제어하는 웹 UI입니다.
Astro 기반 프런트엔드와 Go 백엔드를 단일 실행 파일로 묶어, 별도 서버 설정 없이 로컬 브라우저에서 워크스페이스/세션 UI를 실행할 수 있습니다.

## 기능

- **워크스페이스 관리**: 로컬 폴더를 열고, 최근 워크스페이스를 전환하고, 저장된 워크스페이스를 삭제하고, Git 저장소를 클론한 뒤 엽니다.
- **세션 UI**: 워크스페이스 세션을 탐색하고, 세션을 생성/이름 변경/삭제하고, 이전 대화를 이어가며, 프롬프트/응답을 실시간 스트리밍합니다.
- **프롬프트 제어**: 여러 첨부 파일과 함께 프롬프트를 보내고, 세션별 초안을 보관하고, 실행 중인 작업을 취소하거나 steer하며, pi fallback choice 프롬프트에 인라인으로 응답합니다.
- **트랜스크립트 렌더링**: Markdown, 구문 강조 코드, 도구 출력, 스트리밍 design deck, 긴 트랜스크립트를 가상화로 렌더링합니다.
- **파일 탐색 및 편집**: Material Icon Theme 아이콘으로 워크스페이스 파일 트리를 탐색하고, 파일 검색, 지원 형식 미리보기, 파일 생성/이름 변경/삭제/업로드, 텍스트 파일 편집과 저장을 UI에서 수행합니다.
- **Git 인사이트**: 워크스페이스 Git 상태, 파일 장식, 커밋 기록, 개별 커밋 상세 정보를 확인합니다.
- **로컬 명령 실행**: 선택한 워크스페이스에서 셸 명령을 실행하고 명령 기록/결과를 확인합니다.
- **설정 및 인증**: 프로젝트/전역 pi 설정, API 키, Claude/Codex/Copilot 구독용 OAuth 로그인, 런타임 모델/추론 설정, quota/status 확인을 관리합니다.
- **음성 및 알림**: 응답을 소리 내어 읽고, 브라우저 또는 로컬 Whisper 음성 전사를 사용하고, Discord/Telegram 완료 알림을 설정합니다.
- **국제화 UI**: 브라우저 UI를 영어, 한국어, 중국어, 일본어, 스페인어, 포르투갈어, 프랑스어, 러시아어, 독일어로 전환합니다.
- **AG-UI 브리지**: 클라이언트 통합을 위해 AG-UI 호환 SSE 엔드포인트로 세션 실행을 노출합니다.
- **플러그인(개발 중)**: 신뢰할 수 있는 로컬/GitHub JavaScript 플러그인으로 UI 패널을 추가하고 pi-web API 또는 로컬 백엔드 스크립트를 호출합니다.
- **단일 실행 파일**: Go 바이너리에 Astro 정적 빌드를 내장해 배포하며, 내장 업데이트를 지원합니다.

## 플러그인(개발 중)

플러그인은 실험적 기능이며 신뢰할 수 있는 로컬 코드용입니다. 안정 기능으로 취급되기 전까지 API는 변경될 수 있습니다.

**Settings → Plugins**에서 로컬 폴더 경로나 GitHub `owner/repo` 값으로 설치합니다. 플러그인 폴더에는 `plugin.json`과 entry JavaScript 모듈이 필요합니다.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry`는 필수이고 `backend`는 선택입니다. 두 경로 모두 플러그인 폴더 안에 있어야 합니다.

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

entry 모듈은 `activate(context)` 또는 `default(context)`를 export합니다. 함수 또는 `deactivate()`/`dispose()` 객체를 반환하면 reload, disable, uninstall 시 정리됩니다. 모듈 레벨 `deactivate(context)`도 지원합니다.

플러그인 context:

- `context.app`: `<pi-app>` 엘리먼트.
- `context.plugin`: 파싱된 매니페스트.
- `context.api.get(path)` / `context.api.post(path, body)`: pi-web HTTP API 호출.
- `context.backend(method, { workspaceId, data })`: 선택적 백엔드 호출. `data`가 stdin JSON입니다.

선택적 backend 스크립트는 로컬에서 실행됩니다. JavaScript는 Node로 실행되고 Go는 자동 빌드/캐시됩니다. 스크립트는 `method`, `workspaceRoot` 인자를 받고 stdin에서 JSON을 읽어 stdout에 유효한 JSON을 출력해야 합니다.

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
