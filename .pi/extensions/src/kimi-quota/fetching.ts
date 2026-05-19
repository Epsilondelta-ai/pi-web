import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildKimiRequestHeaders, resolveKimiAuth } from "./auth";
import { mapKimiBalancePayload, mapKimiCodeUsagePayload } from "./mapping";
import { detectKimiProviderKind } from "./provider";
import {
  DEFAULT_KIMI_BALANCE_URL,
  DEFAULT_KIMI_CODE_USAGE_URL,
  STALE_THRESHOLD_MS,
  type KimiBalancePayload,
  type KimiCodeUsagePayload,
  type KimiFetchDeps,
  type KimiQuotaSnapshot,
} from "./types";

export async function loadBestSnapshot(
  ctx: ExtensionContext,
  previousSnapshot: KimiQuotaSnapshot | undefined,
): Promise<KimiQuotaSnapshot> {
  try {
    return await fetchLiveSnapshot(ctx);
  } catch (error) {
    if (!previousSnapshot) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...previousSnapshot,
      source: "cached",
      stale: Date.now() - previousSnapshot.capturedAtMs > STALE_THRESHOLD_MS,
      error: message,
    };
  }
}

export function fetchLiveSnapshot(
  ctx: ExtensionContext,
): Promise<KimiQuotaSnapshot> {
  return fetchLiveSnapshotWithDeps(ctx, { fetchFn: fetch });
}

export async function fetchLiveSnapshotWithDeps(
  ctx: ExtensionContext,
  deps: KimiFetchDeps,
): Promise<KimiQuotaSnapshot> {
  const kind = detectKimiProviderKind(ctx);
  if (!kind) throw new Error("Active Pi model is not a Kimi/Moonshot model");

  const auth = await resolveKimiAuth(ctx, kind);
  if (!auth?.token)
    throw new Error(
      "Missing Kimi/Moonshot API key. Set MOONSHOT_API_KEY or configure the active Pi model provider.",
    );

  const response = await deps.fetchFn(
    kind === "kimi-code"
      ? DEFAULT_KIMI_CODE_USAGE_URL
      : DEFAULT_KIMI_BALANCE_URL,
    {
      method: "GET",
      headers: buildKimiRequestHeaders(auth),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const body = await safeReadText(response);
    throw new Error(
      `Kimi ${kind === "kimi-code" ? "usage" : "balance"} request failed (${response.status}): ${truncateInline(body, 200)}`,
    );
  }

  const payload = await response.json();
  return kind === "kimi-code"
    ? mapKimiCodeUsagePayload(payload as KimiCodeUsagePayload, Date.now())
    : mapKimiBalancePayload(payload as KimiBalancePayload, Date.now());
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function truncateInline(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 1)}…`;
}
