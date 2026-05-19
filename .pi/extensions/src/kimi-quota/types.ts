export const POLL_INTERVAL_MS = 60_000;
export const MIN_EVENT_REFRESH_MS = 15_000;
export const STALE_THRESHOLD_MS = 15 * 60_000;
export const DEFAULT_KIMI_BALANCE_URL = "https://api.moonshot.ai/v1/users/me/balance";
export const DEFAULT_KIMI_CODE_USAGE_URL = "https://api.kimi.com/coding/v1/usages";
export const CLOUDFLARE_WORKERS_AI_PROVIDER = "cloudflare-workers-ai";
export const KIMI_CODE_PROVIDER = "kimi-coding";
export const KIMI_CODE_MODEL = "kimi-for-coding";

export type KimiProviderKind = "moonshot" | "kimi-code";

export type KimiQuotaWindow = {
  label: "5H:" | "7D:";
  usedPercent: number;
  resetsAtMs?: number;
};

export type KimiQuotaSnapshot = {
  kind: KimiProviderKind;
  source: "live" | "cached";
  capturedAtMs: number;
  stale: boolean;
  availableBalance?: number;
  voucherBalance?: number;
  cashBalance?: number;
  primary?: KimiQuotaWindow;
  secondary?: KimiQuotaWindow;
  error?: string;
};

export type KimiBalancePayload = {
  data?: {
    available_balance?: number | string;
    voucher_balance?: number | string;
    cash_balance?: number | string;
  } | null;
};

export type KimiCodeLimitLike = {
  limit?: number | string;
  used?: number | string;
  remaining?: number | string;
  used_percent?: number | string;
  usedPercentage?: number | string;
  resetTime?: number | string;
  reset_time?: number | string;
  resetsAt?: number | string;
  resets_at?: number | string;
};

export type KimiCodeLimit = KimiCodeLimitLike & {
  label?: string;
  name?: string;
  type?: string;
  window?: {
    duration?: number | string;
    minutes?: number | string;
    unit?: string;
  } | null;
  detail?: KimiCodeLimitLike | null;
  details?: KimiCodeLimitLike | null;
};

export type KimiCodeUsagePayload = {
  usage?: (KimiCodeLimitLike & { window?: KimiCodeLimit["window"] }) | null;
  limits?: KimiCodeLimit[] | null;
};

export type KimiFetchFn = typeof fetch;
export type KimiFetchDeps = { fetchFn: KimiFetchFn };
export type KimiResolvedAuth = { token: string; headers: Record<string, string> };
