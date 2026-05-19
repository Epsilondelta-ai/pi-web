import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  getCodexQuotaFooterText,
  hasActiveCodexQuotaContext,
  registerCodexQuota,
} from "./codex-quota";
import {
  getZaiQuotaFooterText,
  hasActiveZaiQuotaContext,
  registerZaiQuota,
} from "./zai-quota";
import {
  getKimiQuotaFooterText,
  hasActiveKimiQuotaContext,
  registerKimiQuota,
} from "./kimi-quota";

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
