import "@testing-library/jest-dom/vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function installMemoryLocalStorage() {
  const items = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => items.clear(),
      getItem: (key: string) => items.get(String(key)) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => items.delete(String(key)),
      setItem: (key: string, value: string) => items.set(String(key), String(value)),
      get length() { return items.size; },
    },
  });
}

try {
  if (typeof localStorage?.getItem !== "function" || typeof localStorage?.setItem !== "function") {
    installMemoryLocalStorage();
  }
} catch {
  installMemoryLocalStorage();
}

const emptyDomRectList = () => ({
  length: 0,
  item: () => null,
  [Symbol.iterator]: function* () {},
}) as DOMRectList;

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = emptyDomRectList;
}
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  }) as DOMRect;
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
