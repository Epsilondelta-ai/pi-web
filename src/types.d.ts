export {};

declare global {
  interface Element {
    [key: string]: any;
  }

  interface EventTarget {
    [key: string]: any;
  }

  interface Window {
    PI_WEB_API_BASE?: string;
  }

  var fetch: typeof globalThis.fetch;
  var EventSource: typeof globalThis.EventSource;
}
