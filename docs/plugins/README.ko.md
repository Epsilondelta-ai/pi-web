# Plugins

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Português (BR)](README.pt-BR.md) | [Français](README.fr.md) |
[Русский](README.ru.md) | [Deutsch](README.de.md)

플러그인은 신뢰할 수 있는 로컬 코드입니다. pi-web core는 작게 유지합니다. core는 플러그인을 로드하고, 공유 RxJS
Subject registry를 노출하고, 플러그인들이 상태를 공유할 때 사용할 이름만 표준화합니다.

## 책임 분리

Core는 app-wide plugin infrastructure만 소유합니다.

- Plugin install, load, reload, disable, uninstall, cleanup lifecycle.
- `piWeb` 공유 RxJS Subject registry.
- 표준 channel name과 payload contract.
- Toolbar, settings, main-area extension을 위한 안정적인 DOM hook name.

플러그인은 user-facing feature를 소유합니다.

- Chat UI, composer, transcript rendering, sessions, shortcuts, toasts, panels, plugin-specific settings.
- Plugin-specific state and persistence.

Core는 chat session을 저장하거나 shortcut behavior를 소유하거나 toast UI를 렌더링하거나 plugin feature API를 제공하지
않습니다.

## Folder structure

플러그인 폴더에는 `plugin.json`과 entry module이 필요합니다. TypeScript 플러그인은 `entry`가 가리키는 JavaScript
파일로 bundle 또는 compile되어야 합니다.

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "0.1.0",
  "entry": "index.js"
}
```

`entry`는 필수입니다. path는 plugin folder 안에 있어야 합니다.

## Entry module

Entry module은 `activate()` 또는 `default()`를 export할 수 있습니다. function을 반환하거나 `deactivate()` 또는
`dispose()`를 가진 object를 반환하면 pi-web이 reload, disable, uninstall 때 cleanup합니다. Module-level
`deactivate()` export도 지원합니다.

```ts
export function activate(): () => void {
  const panel: HTMLElement = document.createElement("section");
  panel.textContent = "Hello from hello-panel";
  document.querySelector("[data-main]")?.append(panel);

  return (): void => {
    panel.remove();
  };
}
```

플러그인은 `document`, `localStorage`, `fetch`, 직접 `rxjs` import, `piWeb` global 같은 browser API를 사용해야
합니다.

## Shared Subject registry

플러그인은 operator, `Observable`, `Subscription`, local subject를 위해 RxJS를 직접 import합니다.

```ts
import { filter, type Subscription } from "rxjs";
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
  const language$: BehaviorSubject<LanguageCode> = piWeb.behaviorSubject<LanguageCode>("core.language", "en");
  language$.next("ko");
}
```

Subscriber 예시:

```ts
import { filter, type Subscription } from "rxjs";

type LanguageCode = "en" | "ko" | "ja";

export function activate(): () => void {
  const subscription: Subscription = piWeb
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

## Channel naming standard

RxJS stream을 담은 변수에는 `$` suffix를 사용합니다. Channel name에는 `$`를 넣지 않습니다.

| Channel | Kind | Payload | Owner |
| --- | --- | --- | --- |
| `core.language` | `BehaviorSubject` | language code string | core |
| `core.language.changed` | `Subject` | language code string | core |
| `core.settings.changed` | `Subject` | `{ key: string; value: unknown }` | core |
| `chat.input` | `BehaviorSubject` | input text string | chat plugin |
| `chat.input.submitted` | `Subject` | `{ text: string; attachments: unknown[] }` | chat plugin |
| `session.activeId` | `BehaviorSubject` | `string | null` | session plugin |
| `session.changed` | `Subject` | session change object | session plugin |
| `shortcut.pressed` | `Subject` | shortcut event object | shortcuts plugin |
| `toast.requested` | `Subject` | toast request object | toast plugin |
| `plugin.<pluginId>.*` | any | plugin-defined | owning plugin |

Naming 규칙:

- Core channel은 `core.`로 시작합니다.
- Feature plugin channel은 feature name으로 시작합니다: `chat.`, `session.`, `shortcut.`, `toast.`.
- Private plugin channel은 `plugin.<pluginId>.`로 시작합니다.
- Event channel은 verb 또는 past-tense event name을 사용합니다: `changed`, `submitted`, `received`, `pressed`.
- State channel은 noun을 사용합니다: `core.language`, `session.activeId`, `chat.input`.

## DOM hook standard

플러그인이 pi-web에 UI를 붙일 때 아래 안정적인 selector를 사용합니다.

| Area | Selector | Use |
| --- | --- | --- |
| Header actions | `[data-plugin-toolbar]` | Top-right header actions에 icon button을 추가합니다. |
| Settings modal | `[data-plugin-settings-root]` | Settings modal 안에 plugin-specific settings section을 추가합니다. |
| Main workspace area | `.app-body[data-view="workspace"]` | Workspace layout container를 읽거나 observe합니다. |
| Main content surface | `.main[data-main]` | 플러그인이 소유하는 primary main-area content를 추가하거나 교체합니다. |
| Sidebar surface | `[data-plugin-sidebar]` | File browser나 git view 같은 optional side panel을 추가합니다. |

플러그인은 cleanup 때 자신이 만든 DOM을 제거하고 subscription을 unsubscribe해야 합니다.
