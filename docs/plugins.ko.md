# 플러그인

[English](plugins.md) | [한국어](plugins.ko.md) | [简体中文](plugins.zh-CN.md) | [日本語](plugins.ja.md) |
[Español](plugins.es.md) | [Português (BR)](plugins.pt-BR.md) | [Français](plugins.fr.md) |
[Русский](plugins.ru.md) | [Deutsch](plugins.de.md)

플러그인은 실험적 기능이며 신뢰할 수 있는 로컬 코드용입니다. 안정화 전까지 API는 변경될 수 있습니다.

## 폴더 구조

플러그인 폴더에는 `plugin.json`과 entry 모듈이 필요합니다. TypeScript 플러그인은 `entry`가 가리키는 JavaScript 파일로 번들 또는 컴파일해야 합니다.

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

## Entry 모듈

Entry 모듈은 `activate(context)` 또는 `default(context)`를 export할 수 있습니다. 함수 또는 `deactivate()`나
`dispose()` 객체를 반환하면 reload, disable, uninstall 시 pi-web이 플러그인을 정리합니다. 모듈 레벨
`deactivate(context)` export도 지원합니다.

```ts
type PluginContext = {
  app: HTMLElement;
  plugin: { id: string; name?: string };
};

export function activate(context: PluginContext): () => void {
  const panel: HTMLElement = document.createElement("section");
  panel.dataset.pluginPanel = context.plugin.id;
  panel.textContent = `Hello from ${context.plugin.name ?? context.plugin.id}`;
  context.app.querySelector("[data-plugin-sidebar]")?.append(panel);

  return (): void => {
    panel.remove();
  };
}
```

## 플러그인 context

- `context.app`: `<pi-app>` 엘리먼트.
- `context.plugin`: 파싱된 매니페스트.
- `context.rxjs`: pi-web core가 제공하는 RxJS namespace.
- `context.api.get(path)` / `context.api.post(path, body)`: pi-web HTTP API 호출.
- `context.backend(method, { workspaceId, data })`: 선택적 backend 스크립트 호출. `workspaceId`는 선택이고
  `data`는 backend stdin JSON이 됩니다.
- `context.mount.chat(element)` / `context.mount.composer(element)`: chat 또는 composer surface mount.
- `context.chat`: transcript message append, stream, render, finalize, scroll.
- `context.composer`: prompt 입력 읽기, 설정, 제출, 취소, 첨부, 초기화.
- `context.session`: active session 확인, prompt 전송, steer, cancel, session event 구독.
- `context.files`: workspace 파일 검색 또는 읽기.
- `context.shell`: workspace shell command 실행.

## 플러그인용 core RxJS

pi-web은 core에 RxJS를 설치하고 `context.rxjs`로 노출합니다. 플러그인끼리 호환되는 observable, subject,
subscription이 필요하면 별도 RxJS 사본을 번들하지 말고 이것을 사용하세요.

```ts
import type { BehaviorSubject, Subscription } from "rxjs";

type PluginContext = {
  rxjs: typeof import("rxjs");
};

type PluginState = {
  count: number;
};

export function activate(context: PluginContext): () => void {
  const state$: BehaviorSubject<PluginState> = new context.rxjs.BehaviorSubject<PluginState>({ count: 0 });
  const subscription: Subscription = state$.subscribe((state: PluginState): void => {
    console.log("plugin state", state);
  });

  state$.next({ count: 1 });

  return (): void => {
    subscription.unsubscribe();
    state$.complete();
  };
}
```

번들하지 않은 브라우저 플러그인 entry에서는 런타임 RxJS import를 사용하지 마세요. 플러그인을 번들한다면 `rxjs`는
external 또는 `peerDependency`로 두고 런타임에서는 `context.rxjs`를 사용하세요. 그래야 플러그인마다 분리된 RxJS
인스턴스를 만들지 않습니다.

RxJS 공유는 라이브러리 인스턴스만 공유합니다. 실제 상태 공유는 같은 `Subject`, `BehaviorSubject`, observable
객체를 plugin context, host API, 명시적 bridge로 전달할 때만 가능합니다.

## 선택적 backend 스크립트

선택적 backend 스크립트는 요청 시 로컬에서 실행됩니다. JavaScript backend는 Node로 실행되고 Go backend는 자동
빌드/캐시됩니다. 스크립트는 `method`, `workspaceRoot` 인자를 받고 stdin에서 `data` JSON을 읽어 stdout에 유효한
JSON을 출력해야 합니다.

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
  const received: BackendInput = JSON.parse(input || "{}");
  const output: BackendOutput = { method, workspaceRoot, received };
  console.log(JSON.stringify(output));
});
```
