export const POLL_INTERVAL_MS = 60_000;
export const MIN_EVENT_REFRESH_MS = 15_000;
export const STALE_THRESHOLD_MS = 15 * 60_000;
export const DEFAULT_ZAI_QUOTA_INTL_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
export const DEFAULT_ZAI_QUOTA_CN_URL = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";

export type ZaiQuotaLimit = {
  type?: string;
  percentage?: number | string;
  used_percent?: number | string;
  usedPercentage?: number | string;
  nextResetTime?: number | string;
  resetTime?: number | string;
  resetsAt?: number | string;
};

export type ZaiQuotaPayload = {
  data?: { limits?: ZaiQuotaLimit[] | null } | null;
  limits?: ZaiQuotaLimit[] | null;
};

export type ZaiAuth = {
  token: string;
  headers: Record<string, string>;
};
