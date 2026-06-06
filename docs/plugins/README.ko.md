# 플러그인

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

플러그인은 신뢰할 수 있는 로컬 코드입니다. pi-web 호스트는 작게 유지하고, 플러그인에는 manifest, lifecycle,
storage 이름, 공유 RxJS Subject registry 표준만 제공합니다.

## 책임 분리

Core는 앱 전체 인프라만 담당합니다.

- 설정 표준과 설정 storage key.
- 언어 표준과 언어 storage key.
- 플러그인 설치, 로드, 리로드, 비활성화, 제거, cleanup lifecycle.
- 공유 RxJS Subject registry.
- 표준 channel 이름과 payload 계약.

플러그인은 사용자 기능을 담당합니다.

- 채팅 UI, composer, transcript rendering, prompt submit, attachment.
- 세션, active session 상태, session persistence.
- 단축키와 command 처리.
- Toast 알림.
- 플러그인 전용 state와 settings.

Core는 채팅 세션을 저장하거나, 단축키 동작을 소유하거나, toast UI를 렌더링하지 않습니다. 플러그인이 직접 담당할 수 있습니다.

## 폴더 구조

플러그인 폴더에는 `plugin.json`과 entry module이 필요합니다. TypeScript 플러그인은 `entry`가 가리키는
JavaScript 파일로 bundle 또는 compile해야 합니다.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js",
  "backend": "backend.js"
}
```

`entry`는 필수이고 `backend`는 선택입니다. 두 path 모두 플러그인 폴더 안에 있어야 합니다.

## Entry module

Entry module은 `activate()` 또는 `default()`를 export할 수 있습니다. function을 반환하거나 `deactivate()` 또는
`dispose()`를 가진 object를 반환하면 pi-web이 reload, disable, uninstall 때 cleanup합니다. Module-level
`deactivate()` export도 지원합니다.

```ts
export function activate(): () => void {
  const panel: HTMLElement = document.createElement("section");
  panel.dataset.pluginPanel = "hello-panel";
  panel.textContent = "Hello from hello-panel";
  document.querySelector("[data-plugin-sidebar]")?.append(panel);

  return (): void => {
    panel.remove();
  };
}
```

## Plugin globals

pi-web은 공유 표준용 browser global 하나를 노출합니다.

- `window.piWeb.subject(name)`: 공유 RxJS `Subject`를 가져오거나 생성합니다.
- `window.piWeb.behaviorSubject(name, initialValue)`: 공유 RxJS `BehaviorSubject`를 가져오거나 생성합니다.
- `window.piWeb.replaySubject(name, bufferSize)`: 공유 RxJS `ReplaySubject`를 가져오거나 생성합니다.
- `window.piWeb.asyncSubject(name)`: 공유 RxJS `AsyncSubject`를 가져오거나 생성합니다.
- `window.piWeb.hasSubject(name)`, `deleteSubject(name)`, `completeSubject(name)`, `listSubjects()`는 registry를
  관리합니다.

이전 build는 compatibility `context` argument를 `activate(context)`에 전달할 수 있습니다. 새 플러그인은
`document`, `localStorage`, `fetch`, 직접 `rxjs` import, `window.piWeb` 같은 browser API를 우선 사용해야 합니다.

## localStorage 표준

플러그인은 browser `localStorage` API를 직접 사용합니다. pi-web은 storage를 감싸지 않습니다. 표준은 key naming과
JSON shape뿐입니다.

```ts
type SessionState = {
  activeSessionId: string | null;
};

const storageKey: string = "pi-web:plugin:session:state";
const state: SessionState = { activeSessionId: "default" };
localStorage.setItem(storageKey, JSON.stringify(state));
```

Key pattern은 아래를 사용합니다.

| Owner | Key | Value |
| --- | --- | --- |
| core | `pi-web:settings` | app settings JSON |
| core | `pi-web:language` | language code string |
| plugin | `pi-web:plugin:<pluginId>:settings` | plugin settings JSON |
| plugin | `pi-web:plugin:<pluginId>:state` | plugin state JSON |
| session plugin | `pi-web:plugin:session:sessions` | session list JSON |
| session plugin | `pi-web:plugin:session:active-session-id` | active session id string |

규칙:

- Top-level prefix는 `pi-web:`을 사용합니다.
- Plugin key에는 manifest의 `plugin.id`를 사용합니다.
- 구조화된 값은 JSON으로 저장합니다.
- 플러그인은 `pi-web:plugin:<pluginId>:` 아래에 key를 추가로 정의할 수 있습니다.

## RxJS 표준

플러그인은 operator, `Observable`, `Subscription`, local subject를 위해 RxJS를 직접 import합니다.

```ts
import { filter, map, type Subscription } from "rxjs";
```

pi-web은 플러그인이 같은 이름으로 같은 Subject instance를 얻을 수 있도록 공유 Subject registry만 제공합니다.
Operator나 observable composition은 감싸지 않습니다.

```ts
import type { BehaviorSubject, Subject } from "rxjs";

type PiWebSubjects = {
  subject<T>(name: string): Subject<T>;
  behaviorSubject<T>(name: string, initialValue: T): BehaviorSubject<T>;
  replaySubject<T>(name: string, bufferSize?: number): import("rxjs").ReplaySubject<T>;
  asyncSubject<T>(name: string): import("rxjs").AsyncSubject<T>;
  hasSubject(name: string): boolean;
  deleteSubject(name: string): boolean;
  completeSubject(name: string): void;
  listSubjects(): string[];
};
```

Publisher 예시:

```ts
import type { BehaviorSubject } from "rxjs";

type LanguageCode = "en" | "ko" | "ja";

export function activate(): void {
  const language$: BehaviorSubject<LanguageCode> = window.piWeb.behaviorSubject<LanguageCode>(
    "core.language",
    "en",
  );
  language$.next("ko");
}
```

Subscriber 예시:

```ts
import { filter, type Subscription } from "rxjs";

type LanguageCode = "en" | "ko" | "ja";

export function activate(): () => void {
  const subscription: Subscription = window.piWeb
    .behaviorSubject<LanguageCode>("core.language", "en")
    .pipe(filter((language: LanguageCode): boolean => language.length > 0))
    .subscribe((language: LanguageCode): void => {
      console.log(language);
    });

  return (): void => {
    subscription.unsubscribe();
  };
}
```

Registry 규칙:

- 같은 `name`은 같은 Subject instance를 반환합니다.
- 하나의 name을 다른 Subject kind로 재사용할 수 없습니다.
- `behaviorSubject`에서는 첫 호출의 initial value가 기준입니다. 이후 initial value는 무시합니다.
- `deleteSubject`는 plugin-owned channel용입니다. Core channel은 삭제하지 않습니다.
- 권한과 read-only 정책은 이 표준에 포함하지 않습니다.

## 표준 channel

RxJS stream을 담은 변수에는 `$` suffix를 사용합니다. Channel name에는 `$`를 넣지 않습니다.

| Channel | Kind | Payload | Owner |
| --- | --- | --- | --- |
| `core.language` | `BehaviorSubject` | language code string | core |
| `core.language.changed` | `Subject` | language code string | core |
| `core.settings.changed` | `Subject` | `{ key: string; value: unknown }` | core |
| `chat.input` | `BehaviorSubject` | input text string | chat plugin |
| `chat.input.submitted` | `Subject` | `{ text: string; attachments: unknown[] }` | chat plugin |
| `chat.message.received` | `Subject` | message object | chat plugin |
| `session.activeId` | `BehaviorSubject` | `string | null` | session plugin |
| `session.changed` | `Subject` | session change object | session plugin |
| `shortcut.pressed` | `Subject` | shortcut event object | shortcuts plugin |
| `toast.requested` | `Subject` | toast request object | toast plugin |
| `button.clicked` | `Subject` | button event object | owning plugin |
| `touch.pressed` | `Subject` | touch event object | owning plugin |

## Naming 규칙

- Core channel은 `core.`로 시작합니다.
- Feature plugin channel은 feature name으로 시작합니다: `chat.`, `session.`, `shortcut.`, `toast.`.
- Private plugin channel은 `plugin.<pluginId>.`로 시작합니다.
- Event channel은 verb 또는 past-tense event name을 사용합니다: `changed`, `submitted`, `received`, `pressed`.
- State channel은 noun을 사용합니다: `core.language`, `session.activeId`, `chat.input`.

## Cleanup

플러그인은 subscription을 unsubscribe하고 자신이 만든 DOM을 제거해야 합니다. Plugin-owned Subject는 unload 때
complete 또는 delete할 수 있습니다.

```ts
import type { Subscription } from "rxjs";

export function activate(): () => void {
  const subscription: Subscription = window.piWeb
    .subject<string>("plugin.example.closed")
    .subscribe((value: string): void => console.log(value));

  return (): void => {
    subscription.unsubscribe();
    window.piWeb.completeSubject("plugin.example.closed");
    window.piWeb.deleteSubject("plugin.example.closed");
  };
}
```

## 선택 backend script

선택 backend script는 필요할 때 로컬에서 실행됩니다. JavaScript backend는 Node로 실행되고 Go backend는 자동으로 build/cache됩니다.
Script는 `method`와 `workspaceRoot` argument를 받고, stdin에서 `data` JSON을 읽은 뒤 stdout에 valid JSON을 출력해야 합니다.

```ts
type BackendInput = Record<string, unknown>;

type BackendOutput = {
  method: string;
  workspaceRoot: string;
  received: BackendInput;
};

const [, , method = "", workspaceRoot = ""]: string[] = process.argv;
let input = "";

process.stdin.on("data", (chunk: Buffer): void => {
  input += chunk.toString("utf8");
});

process.stdin.on("end", (): void => {
  const received: BackendInput = JSON.parse(input || "{}") as BackendInput;
  const output: BackendOutput = { method, workspaceRoot, received };
  console.log(JSON.stringify(output));
});
```
