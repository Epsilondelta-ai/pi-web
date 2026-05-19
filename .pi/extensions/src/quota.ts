import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  fetchCodexQuotaSnapshot,
  getCodexQuotaFooterText,
  hasActiveCodexQuotaContext,
  registerCodexQuota,
} from "./codex-quota";
import {
  getZaiQuotaFooterText,
  hasActiveZaiQuotaContext,
  registerZaiQuota,
} from "./zai-quota";
import { fetchLiveSnapshot as fetchZaiQuotaSnapshot } from "./zai-quota/fetching";
import { detectZaiModel } from "./zai-quota/provider";
import {
  getKimiQuotaFooterText,
  hasActiveKimiQuotaContext,
  registerKimiQuota,
} from "./kimi-quota";
import { fetchLiveSnapshot as fetchKimiQuotaSnapshot } from "./kimi-quota/fetching";
import { formatKimiQuotaFooterText } from "./kimi-quota/formatting";
import { detectKimiProviderKind } from "./kimi-quota/provider";
import { formatQuotaSnapshot } from "./quota-shared";

export function registerQuota(
  pi: ExtensionAPI,
  onUpdate: (ctx: ExtensionContext) => void,
): void {
  registerCodexQuota(pi, onUpdate);
  registerZaiQuota(pi, onUpdate);
  registerKimiQuota(pi, onUpdate);
}

export function getQuotaFooterText(width: number): string | undefined {
  if (hasActiveCodexQuotaContext()) return getCodexQuotaFooterText(width);
  if (hasActiveZaiQuotaContext()) return getZaiQuotaFooterText(width);
  if (hasActiveKimiQuotaContext()) return getKimiQuotaFooterText(width);
  return undefined;
}

export async function fetchQuotaFooterText(ctx: ExtensionContext): Promise<string | undefined> {
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  const provider = String(model?.provider ?? "").toLowerCase();
  const id = String(model?.id ?? "").toLowerCase();
  const name = String(model?.name ?? model?.displayName ?? model?.display_name ?? "").toLowerCase();

  if (provider === "openai-codex" || provider.includes("codex") || id.startsWith("gpt-") || name.includes("gpt")) {
    return formatQuotaSnapshot(await fetchCodexQuotaSnapshot(ctx));
  }
  if (detectZaiModel(ctx)) {
    return formatQuotaSnapshot(await fetchZaiQuotaSnapshot(ctx));
  }
  if (detectKimiProviderKind(ctx)) {
    return formatKimiQuotaFooterText(await fetchKimiQuotaSnapshot(ctx));
  }
  return undefined;
}
