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
    piWeb?: import("./pi-app/plugins/plugin-subjects").PiWebSubjects;
  }

  var fetch: typeof globalThis.fetch;
  var EventSource: typeof globalThis.EventSource;
}
