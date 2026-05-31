import { existsSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_CONTEXT_BYTES = 64_000;
const REQUIRED_CONTEXT_PATH = "AGENTS.md";

export default function (pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd;
    const injected = readContextBlock(cwd, REQUIRED_CONTEXT_PATH);

    const systemPrompt = [
      event.systemPrompt,
      buildGateInstruction(),
      `<mandatory_context_gate>\n${injected}\n</mandatory_context_gate>`,
    ].join("\n\n");

    return { systemPrompt };
  });
}

function readContextBlock(cwd: string, path: string): string {
  const absolutePath = resolve(cwd, path);

  if (!existsSync(absolutePath)) {
    return `<required_context path="${escapeAttr(path)}" status="missing" />`;
  }

  const realPath = realpathSync(absolutePath);
  const realRelativePath = relative(cwd, realPath) || path;
  const content = truncate(readFileSync(absolutePath, "utf8"), MAX_CONTEXT_BYTES);

  const escapedPath = escapeAttr(path);
  const escapedRealPath = escapeAttr(realRelativePath);

  return `<required_context path="${escapedPath}" realpath="${escapedRealPath}">\n${escapeText(content)}\n</required_context>`;
}

function buildGateInstruction(): string {
  return [
    "CONTEXT GATE:",
    "- Use mandatory_context_gate first; AGENTS.md = authority.",
    "- Missing/contradiction → blocker; no guess.",
    "- Injected by .pi/extensions/context-gate.ts; overrides weaker rules.",
  ].join("\n");
}

function truncate(value: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) return value;

  let result = value;
  while (Buffer.byteLength(result, "utf8") > maxBytes) {
    result = result.slice(0, Math.max(0, result.length - 1024));
  }
  return `${result}\n\n[truncated to ${maxBytes} bytes from ${bytes} bytes]`;
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
