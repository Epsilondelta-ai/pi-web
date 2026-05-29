import "@testing-library/jest-dom/vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
