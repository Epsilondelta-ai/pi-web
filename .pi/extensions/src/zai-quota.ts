import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { formatQuotaSnapshot, type QuotaSnapshot } from "./quota-shared";
import { fetchLiveSnapshot } from "./zai-quota/fetching";
import { detectZaiModel, modelContextKey } from "./zai-quota/provider";
import {
  MIN_EVENT_REFRESH_MS,
  POLL_INTERVAL_MS,
  STALE_THRESHOLD_MS,
} from "./zai-quota/types";

let latestSnapshot: QuotaSnapshot | undefined;
let refreshInFlight: Promise<void> | undefined;
let refreshInFlightKey = "";
let refreshGeneration = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let activeCtx: ExtensionContext | undefined;
let lastRefreshStartedAt = 0;
let shutdownRequested = false;

export function registerZaiQuota(
  pi: ExtensionAPI,
  onUpdate: (ctx: ExtensionContext) => void,
): void {
  async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
    activeCtx = ctx;
    if (!detectZaiModel(ctx)) {
      latestSnapshot = undefined;
      refreshGeneration++;
      onUpdate(ctx);
      return;
    }

    const now = Date.now();
    const requestKey = modelContextKey(ctx);
    if (!force && now - lastRefreshStartedAt < 2_000) return refreshInFlight;
    if (!force && refreshInFlight && refreshInFlightKey === requestKey) {
      return refreshInFlight;
    }

    const generation = ++refreshGeneration;
    lastRefreshStartedAt = now;
    refreshInFlightKey = requestKey;
    const currentRefresh = (async () => {
      let nextSnapshot: QuotaSnapshot | undefined;
      try {
        nextSnapshot = await fetchLiveSnapshot(ctx);
      } catch (error) {
        nextSnapshot = fallbackSnapshot(error, latestSnapshot);
      } finally {
        if (refreshInFlight === currentRefresh) refreshInFlight = undefined;
        if (isCurrentRefresh(ctx, generation, requestKey)) {
          latestSnapshot = nextSnapshot;
          onUpdate(ctx);
        }
      }
    })();
    refreshInFlight = currentRefresh;
    return currentRefresh;
  }

  const refreshInBackground = (ctx: ExtensionContext, force = false) => {
    void refresh(ctx, force);
  };

  pi.on("session_start", async (_event, ctx) => {
    shutdownRequested = false;
    activeCtx = ctx;
    stopPolling();
    pollTimer = setInterval(
      () => activeCtx && refreshInBackground(activeCtx),
      POLL_INTERVAL_MS,
    );
    refreshInBackground(ctx, true);
  });

  pi.on("model_select", async (_event, ctx) => refreshInBackground(ctx, true));
  pi.on("turn_end", async (_event, ctx) => {
    if (Date.now() - lastRefreshStartedAt < MIN_EVENT_REFRESH_MS) {
      return onUpdate(ctx);
    }
    refreshInBackground(ctx);
  });

  pi.on("session_shutdown", async () => {
    shutdownRequested = true;
    refreshGeneration++;
    stopPolling();
    activeCtx = undefined;
  });
}

export function getZaiQuotaFooterText(_width: number): string | undefined {
  return latestSnapshot ? formatQuotaSnapshot(latestSnapshot) : undefined;
}

export function hasActiveZaiQuotaContext(): boolean {
  return Boolean(activeCtx && detectZaiModel(activeCtx));
}

function isCurrentRefresh(
  ctx: ExtensionContext,
  generation: number,
  requestKey: string,
): boolean {
  return (
    !shutdownRequested &&
    generation === refreshGeneration &&
    activeCtx === ctx &&
    modelContextKey(ctx) === requestKey &&
    detectZaiModel(ctx)
  );
}

function fallbackSnapshot(
  error: unknown,
  previousSnapshot: QuotaSnapshot | undefined,
): QuotaSnapshot {
  const message = error instanceof Error ? error.message : String(error);
  if (!previousSnapshot) {
    return {
      source: "cached",
      capturedAtMs: Date.now(),
      stale: true,
      error: message,
    };
  }
  return {
    ...previousSnapshot,
    source: "cached",
    stale: Date.now() - previousSnapshot.capturedAtMs > STALE_THRESHOLD_MS,
    error: message,
  };
}

function stopPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = undefined;
}
