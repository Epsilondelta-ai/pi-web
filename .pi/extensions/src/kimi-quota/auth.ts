import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { KimiProviderKind, KimiResolvedAuth } from "./types";

export async function resolveKimiAuth(
  ctx: ExtensionContext,
  kind: KimiProviderKind,
): Promise<KimiResolvedAuth | undefined> {
  const model = ctx.model;
  if (model && ctx.modelRegistry?.getApiKeyAndHeaders) {
    const result = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (result.ok) {
      const headers = sanitizeHeaderRecord(result.headers);
      const apiKey = sanitizeSecret(result.apiKey);
      const bearer = extractBearerToken(
        headers.Authorization ?? headers.authorization,
      );
      const token = apiKey ?? bearer;
      if (token) return { token, headers };
    }
  }

  const fallback =
    kind === "kimi-code"
      ? sanitizeSecret(process.env.KIMI_API_KEY)
      : sanitizeSecret(process.env.MOONSHOT_API_KEY);
  return fallback ? { token: fallback, headers: {} } : undefined;
}

export function buildKimiRequestHeaders(
  auth: KimiResolvedAuth,
): Record<string, string> {
  const headers = { ...auth.headers };
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "authorization") delete headers[key];
  }
  if (
    !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
  ) {
    headers["Content-Type"] = "application/json";
  }
  headers.Authorization = `Bearer ${auth.token}`;
  return headers;
}

function sanitizeHeaderRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") headers[key] = raw;
  }
  return headers;
}

function sanitizeSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function extractBearerToken(value: string | undefined): string | undefined {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return sanitizeSecret(match?.[1]);
}
