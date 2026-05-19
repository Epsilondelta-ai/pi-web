import { renderAnsiBody } from "../renderers";

const LARGE_TOOL_BODY_CHARS = 16_000;
const TOOL_BODY_PREVIEW_CHARS = 8_000;

export function isLargeToolBody(body = "") {
  return body.length > LARGE_TOOL_BODY_CHARS;
}

export function renderToolBodyPreview(body = "") {
  if (!isLargeToolBody(body)) return renderAnsiBody(body);
  const head = body.slice(0, TOOL_BODY_PREVIEW_CHARS);
  const omitted = body.length - head.length;
  return [
    renderAnsiBody(head),
    `<div class="tc-body-notice">`,
    `Large output previewed for performance. ${omitted.toLocaleString()} characters omitted.`,
    ` <button type="button" data-action="show-full-tool-output">show full output</button>`,
    `</div>`,
  ].join("");
}

export function renderToolBody(body = "", { collapsed = false } = {}) {
  if (collapsed && isLargeToolBody(body)) return renderToolBodyPreview(body);
  return renderAnsiBody(body);
}

export function storeFullToolBody(element, body = "") {
  if (!isLargeToolBody(body)) return;
  element.__fullToolBody = body;
  element.dataset.largeToolBody = "true";
}

export function fullToolBody(element) {
  return element?.__fullToolBody || "";
}
