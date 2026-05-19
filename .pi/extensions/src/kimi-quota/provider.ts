import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CLOUDFLARE_WORKERS_AI_PROVIDER,
  KIMI_CODE_MODEL,
  KIMI_CODE_PROVIDER,
  type KimiProviderKind,
} from "./types";

export function detectKimiProviderKind(
  ctx: Pick<ExtensionContext, "hasUI" | "model">,
): KimiProviderKind | undefined {
  if (!ctx.hasUI) return undefined;
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  if (!model) return undefined;

  const provider = String(model.provider ?? "").toLowerCase();
  if (provider === CLOUDFLARE_WORKERS_AI_PROVIDER) return undefined;

  const id = String(model.id ?? "").toLowerCase();
  const baseUrl = String(model.baseUrl ?? "");
  const hasBaseUrl = baseUrl.trim() !== "";

  if (hasBaseUrl) {
    if (isAllowedKimiCodeBaseURL(baseUrl)) return "kimi-code";
    if (provider === KIMI_CODE_PROVIDER || id === KIMI_CODE_MODEL)
      return undefined;
    if (isAllowedMoonshotBaseURL(baseUrl)) return "moonshot";
    if (provider === "kimi" || provider === "moonshot") return undefined;
    return undefined;
  }

  if (provider === KIMI_CODE_PROVIDER || id === KIMI_CODE_MODEL)
    return "kimi-code";
  if (provider === "kimi" || provider === "moonshot") return "moonshot";
  return undefined;
}

export function modelContextKey(ctx: ExtensionContext): string {
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  return `${String(model?.provider ?? "none")}:${String(model?.id ?? "none")}:${String(model?.baseUrl ?? "")}`;
}

function isAllowedMoonshotBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  if (!url) return false;
  return (
    hostMatchesDomain(url.hostname.toLowerCase(), "moonshot.ai") ||
    hostMatchesDomain(url.hostname.toLowerCase(), "kimi.ai")
  );
}

function isAllowedKimiCodeBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  if (!url) return false;
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "api.kimi.com") return false;
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  return normalizedPath === "/coding" || normalizedPath === "/coding/v1";
}

function parseURL(rawURL: string): URL | undefined {
  try {
    return new URL(rawURL);
  } catch {
    return undefined;
  }
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}
