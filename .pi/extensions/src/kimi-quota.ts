import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { fetchLiveSnapshotWithDeps, loadBestSnapshot } from "./kimi-quota/fetching";
import { formatKimiBalanceFooterText, formatKimiQuotaFooterText } from "./kimi-quota/formatting";
import { mapKimiBalancePayload, mapKimiCodeUsagePayload } from "./kimi-quota/mapping";
import { detectKimiProviderKind, modelContextKey } from "./kimi-quota/provider";
import {
  DEFAULT_KIMI_BALANCE_URL,
  DEFAULT_KIMI_CODE_USAGE_URL,
  MIN_EVENT_REFRESH_MS,
  POLL_INTERVAL_MS,
  type KimiBalancePayload,
  type KimiCodeUsagePayload,
  type KimiFetchFn,
  type KimiProviderKind,
  type KimiQuotaSnapshot,
} from "./kimi-quota/types";

export type { KimiQuotaSnapshot } from "./kimi-quota/types";

let latestSnapshot: KimiQuotaSnapshot | undefined;
let refreshInFlight: Promise<void> | undefined;
let refreshInFlightKey = "";
let refreshGeneration = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let activeCtx: ExtensionContext | undefined;
let lastRefreshStartedAt = 0;
let shutdownRequested = false;

export function registerKimiQuota(
  pi: ExtensionAPI,
  onUpdate: (ctx: ExtensionContext) => void,
): void {
  async function refresh(
    ctx: ExtensionContext,
    options?: { force?: boolean },
  ): Promise<void> {
    activeCtx = ctx;
    if (!detectKimiProviderKind(ctx)) {
      latestSnapshot = undefined;
      refreshGeneration++;
      onUpdate(ctx);
      return;
    }

    const now = Date.now();
    const requestKey = modelContextKey(ctx);
    if (!options?.force && now - lastRefreshStartedAt < 2_000)
      return refreshInFlight;
    if (!options?.force && refreshInFlight && refreshInFlightKey === requestKey)
      return refreshInFlight;

    const generation = ++refreshGeneration;
    lastRefreshStartedAt = now;
    refreshInFlightKey = requestKey;
    const currentRefresh = runRefresh(ctx, requestKey, generation, onUpdate).finally(() => {
      if (refreshInFlight === currentRefresh) refreshInFlight = undefined;
    });
    refreshInFlight = currentRefresh;
    return currentRefresh;
  }

  function refreshInBackground(
    ctx: ExtensionContext,
    options?: { force?: boolean },
  ): void {
    void refresh(ctx, options);
  }

  function startPolling(ctx: ExtensionContext): void {
    activeCtx = ctx;
    stopPolling();
    pollTimer = setInterval(() => {
      if (activeCtx) refreshInBackground(activeCtx);
    }, POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function refreshIfDue(ctx: ExtensionContext): void {
    activeCtx = ctx;
    if (!detectKimiProviderKind(ctx)) {
      latestSnapshot = undefined;
      onUpdate(ctx);
      return;
    }
    if (Date.now() - lastRefreshStartedAt < MIN_EVENT_REFRESH_MS) {
      onUpdate(ctx);
      return;
    }
    refreshInBackground(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    shutdownRequested = false;
    activeCtx = ctx;
    startPolling(ctx);
    refreshInBackground(ctx, { force: true });
  });

  pi.on("model_select", async (_event, ctx) => {
    activeCtx = ctx;
    refreshInBackground(ctx, { force: true });
  });

  pi.on("turn_end", async (_event, ctx) => {
    refreshIfDue(ctx);
  });

  pi.on("session_shutdown", async () => {
    shutdownRequested = true;
    refreshGeneration++;
    stopPolling();
    activeCtx = undefined;
  });
}

async function runRefresh(
  ctx: ExtensionContext,
  requestKey: string,
  generation: number,
  onUpdate: (ctx: ExtensionContext) => void,
): Promise<void> {
  let nextSnapshot: KimiQuotaSnapshot | undefined;
  try {
    nextSnapshot = await loadBestSnapshot(ctx, latestSnapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    nextSnapshot = latestSnapshot
      ? { ...latestSnapshot, source: "cached", stale: true, error: message }
      : {
          kind: detectKimiProviderKind(ctx) ?? "moonshot",
          source: "cached",
          capturedAtMs: Date.now(),
          stale: true,
          error: message,
        };
  } finally {
    const stillCurrent =
      !shutdownRequested &&
      generation === refreshGeneration &&
      activeCtx === ctx &&
      modelContextKey(ctx) === requestKey &&
      Boolean(detectKimiProviderKind(ctx));
    if (stillCurrent) {
      latestSnapshot = nextSnapshot;
      onUpdate(ctx);
    }
  }
}

export function getKimiQuotaFooterText(_width: number): string | undefined {
  if (!latestSnapshot) return undefined;
  return formatKimiQuotaFooterText(latestSnapshot);
}

export function hasActiveKimiQuotaContext(): boolean {
  return Boolean(activeCtx && detectKimiProviderKind(activeCtx));
}

export function isKimiMoonshotModelForTest(
  ctx: Pick<ExtensionContext, "hasUI" | "model">,
): boolean {
  return Boolean(detectKimiProviderKind(ctx));
}

export function kimiProviderKindForTest(
  ctx: Pick<ExtensionContext, "hasUI" | "model">,
): KimiProviderKind | undefined {
  return detectKimiProviderKind(ctx);
}

export function mapKimiBalancePayloadForTest(
  payload: KimiBalancePayload,
  capturedAtMs: number,
): KimiQuotaSnapshot {
  return mapKimiBalancePayload(payload, capturedAtMs);
}

export function mapKimiCodeUsagePayloadForTest(
  payload: KimiCodeUsagePayload,
  capturedAtMs: number,
): KimiQuotaSnapshot {
  return mapKimiCodeUsagePayload(payload, capturedAtMs);
}

export function formatKimiBalanceFooterTextForTest(
  snapshot: KimiQuotaSnapshot,
): string | undefined {
  return formatKimiBalanceFooterText(snapshot);
}

export function formatKimiQuotaFooterTextForTest(
  snapshot: KimiQuotaSnapshot,
): string | undefined {
  return formatKimiQuotaFooterText(snapshot);
}

export async function fetchLiveSnapshotForTest(
  ctx: ExtensionContext,
  fetchFn: KimiFetchFn,
): Promise<KimiQuotaSnapshot> {
  return fetchLiveSnapshotWithDeps(ctx, { fetchFn });
}

export function kimiBalanceURLForTest(): string {
  return DEFAULT_KIMI_BALANCE_URL;
}

export function kimiCodeUsageURLForTest(): string {
  return DEFAULT_KIMI_CODE_USAGE_URL;
}
