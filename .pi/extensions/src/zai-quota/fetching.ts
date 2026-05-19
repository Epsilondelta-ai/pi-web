import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  clamp,
  extractBearerToken,
  hostMatchesDomain,
  parseResetTime,
  parseURL,
  safeReadText,
  sanitizeHeaderRecord,
  sanitizeNumber,
  sanitizeSecret,
  truncateInline,
  type QuotaSnapshot,
  type QuotaWindow,
} from "../quota-shared";
import {
  DEFAULT_ZAI_QUOTA_CN_URL,
  DEFAULT_ZAI_QUOTA_INTL_URL,
  type ZaiAuth,
  type ZaiQuotaLimit,
  type ZaiQuotaPayload,
} from "./types";

export async function fetchLiveSnapshot(
  ctx: ExtensionContext,
): Promise<QuotaSnapshot> {
  const auth = await resolveZaiAuth(ctx);
  if (!auth?.token) {
    throw new Error("Missing Z.AI/GLM API key. Set ZAI_API_KEY or GLM_API_KEY.");
  }

  let lastError: Error | undefined;
  for (const url of quotaUrlsForContext(ctx)) {
    const response = await fetch(url, {
      method: "GET",
      headers: buildZaiRequestHeaders(auth),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      lastError = new Error(
        `Z.AI quota request failed (${response.status}): ${truncateInline(body, 200)}`,
      );
      continue;
    }

    return mapZaiQuotaPayload((await response.json()) as ZaiQuotaPayload);
  }

  throw lastError ?? new Error("Z.AI quota request failed");
}

async function resolveZaiAuth(
  ctx: ExtensionContext,
): Promise<ZaiAuth | undefined> {
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

  const token =
    sanitizeSecret(process.env.ZAI_API_KEY) ??
    sanitizeSecret(process.env.GLM_API_KEY);
  return token ? { token, headers: {} } : undefined;
}

function mapZaiQuotaPayload(payload: ZaiQuotaPayload): QuotaSnapshot {
  const limits = payload.data?.limits?.length
    ? payload.data.limits
    : (payload.limits ?? []);
  const tokenLimit = limits.find(
    (limit) => String(limit.type ?? "").toUpperCase() === "TOKENS_LIMIT",
  );
  const primarySource = tokenLimit ?? limits[0];
  const secondarySource = limits.find(
    (limit) => limit !== primarySource && resolveUsedPercent(limit) !== undefined,
  );
  const snapshot: QuotaSnapshot = {
    source: "live",
    capturedAtMs: Date.now(),
    stale: false,
    primary: buildUsageWindow(primarySource, "5H:"),
    secondary: buildUsageWindow(secondarySource, "7D:"),
  };
  if (!snapshot.primary && !snapshot.secondary) {
    throw new Error("Z.AI quota response did not contain quota limits");
  }
  return snapshot;
}

function buildUsageWindow(
  limit: ZaiQuotaLimit | undefined,
  label: QuotaWindow["label"],
): QuotaWindow | undefined {
  const usedPercent = resolveUsedPercent(limit);
  if (usedPercent === undefined) return undefined;

  return {
    label,
    usedPercent: clamp(usedPercent, 0, 100),
    resetsAtMs: parseResetTime(
      limit?.nextResetTime ?? limit?.resetTime ?? limit?.resetsAt,
    ),
  };
}

function resolveUsedPercent(
  limit: ZaiQuotaLimit | undefined,
): number | undefined {
  if (!limit) return undefined;
  return (
    sanitizeNumber(limit.percentage) ??
    sanitizeNumber(limit.used_percent) ??
    sanitizeNumber(limit.usedPercentage)
  );
}

function quotaUrlsForContext(ctx: Pick<ExtensionContext, "model">): string[] {
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  const baseUrl = String(model?.baseUrl ?? "");
  if (isAllowedBigModelBaseURL(baseUrl)) {
    return [DEFAULT_ZAI_QUOTA_CN_URL, DEFAULT_ZAI_QUOTA_INTL_URL];
  }
  return [DEFAULT_ZAI_QUOTA_INTL_URL, DEFAULT_ZAI_QUOTA_CN_URL];
}

function buildZaiRequestHeaders(auth: ZaiAuth): Record<string, string> {
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

function isAllowedBigModelBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  return Boolean(
    url && hostMatchesDomain(url.hostname.toLowerCase(), "bigmodel.cn"),
  );
}
