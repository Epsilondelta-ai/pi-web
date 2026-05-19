import type {
  KimiBalancePayload,
  KimiCodeLimit,
  KimiCodeLimitLike,
  KimiCodeUsagePayload,
  KimiQuotaSnapshot,
  KimiQuotaWindow,
} from "./types";

export function mapKimiBalancePayload(
  payload: KimiBalancePayload,
  capturedAtMs: number,
): KimiQuotaSnapshot {
  const availableBalance = sanitizeNumber(payload.data?.available_balance);
  const voucherBalance = sanitizeNumber(payload.data?.voucher_balance);
  const cashBalance = sanitizeNumber(payload.data?.cash_balance);
  if (
    availableBalance === undefined &&
    voucherBalance === undefined &&
    cashBalance === undefined
  ) {
    throw new Error("Kimi balance response did not contain balance fields");
  }
  return {
    kind: "moonshot",
    source: "live",
    capturedAtMs,
    stale: false,
    availableBalance,
    voucherBalance,
    cashBalance,
  };
}

export function mapKimiCodeUsagePayload(
  payload: KimiCodeUsagePayload,
  capturedAtMs: number,
): KimiQuotaSnapshot {
  let primary = findLimitUsageWindow(payload, "5H:");
  let secondary = findLimitUsageWindow(payload, "7D:");

  if (payload.usage) {
    const topLevelLabel = inferTopLevelUsageLabel(
      payload.usage,
      Boolean(primary),
      Boolean(secondary),
    );
    const topLevelWindow = topLevelLabel
      ? buildUsageWindow(payload.usage, topLevelLabel)
      : undefined;
    if (topLevelLabel === "5H:" && !primary) primary = topLevelWindow;
    if (topLevelLabel === "7D:" && !secondary) secondary = topLevelWindow;
  }

  if (!primary && !secondary)
    throw new Error("Kimi Code usage response did not contain quota windows");
  return {
    kind: "kimi-code",
    source: "live",
    capturedAtMs,
    stale: false,
    primary,
    secondary,
  };
}

function findLimitUsageWindow(
  payload: KimiCodeUsagePayload,
  label: KimiQuotaWindow["label"],
): KimiQuotaWindow | undefined {
  for (const rawLimit of payload.limits ?? []) {
    const duration = windowDurationMinutes(rawLimit.window);
    const text =
      `${rawLimit.label ?? ""} ${rawLimit.name ?? ""} ${rawLimit.type ?? ""}`.toLowerCase();
    const isFiveHour =
      label === "5H:" &&
      (duration === 300 ||
        text.includes("5h") ||
        text.includes("5 h") ||
        text.includes("five"));
    const isWeekly =
      label === "7D:" &&
      (duration === 10_080 ||
        text.includes("week") ||
        text.includes("7d") ||
        text.includes("7 d"));
    if (isFiveHour || isWeekly) return buildUsageWindow(rawLimit, label);
  }
  return undefined;
}

function inferTopLevelUsageLabel(
  usage: KimiCodeUsagePayload["usage"],
  hasPrimary: boolean,
  hasSecondary: boolean,
): KimiQuotaWindow["label"] | undefined {
  if (!usage) return undefined;
  const duration = windowDurationMinutes(usage.window);
  if (duration === 300) return "5H:";
  if (duration === 10_080) return "7D:";
  if (hasPrimary && !hasSecondary) return "7D:";
  if (!hasPrimary) return "5H:";
  return undefined;
}

function buildUsageWindow(
  raw: KimiCodeLimit | KimiCodeUsagePayload["usage"],
  label: KimiQuotaWindow["label"],
): KimiQuotaWindow | undefined {
  if (!raw) return undefined;
  const detail = "detail" in raw ? raw.detail : undefined;
  const details = "details" in raw ? raw.details : undefined;
  const source = { ...raw, ...(details ?? {}), ...(detail ?? {}) };
  const usedPercent = resolveUsedPercent(source);
  if (usedPercent === undefined) return undefined;
  return {
    label,
    usedPercent: clamp(usedPercent, 0, 100),
    resetsAtMs: parseResetTime(
      source.resetTime ??
        source.reset_time ??
        source.resetsAt ??
        source.resets_at,
    ),
  };
}

function windowDurationMinutes(
  window: KimiCodeLimit["window"],
): number | undefined {
  if (!window) return undefined;
  const direct =
    sanitizeNumber(window.duration) ?? sanitizeNumber(window.minutes);
  if (direct === undefined) return undefined;
  const unit = String(window.unit ?? "minutes").toLowerCase();
  if (unit.startsWith("hour")) return direct * 60;
  if (unit.startsWith("day")) return direct * 1_440;
  if (unit.startsWith("second")) return Math.ceil(direct / 60);
  return direct;
}

function resolveUsedPercent(source: KimiCodeLimitLike): number | undefined {
  const explicitPercent =
    sanitizeNumber(source.used_percent) ??
    sanitizeNumber(source.usedPercentage);
  if (explicitPercent !== undefined)
    return explicitPercent > 1 ? explicitPercent : explicitPercent * 100;

  const limit = sanitizeNumber(source.limit);
  const used = sanitizeNumber(source.used);
  const remaining = sanitizeNumber(source.remaining);
  if (limit === undefined || limit <= 0) return undefined;
  if (used !== undefined) return (used / limit) * 100;
  if (remaining !== undefined) return ((limit - remaining) / limit) * 100;
  return undefined;
}

function parseResetTime(
  value: number | string | undefined,
): number | undefined {
  if (typeof value === "number" && Number.isFinite(value))
    return value > 1_000_000_000_000 ? value : value * 1000;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric))
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sanitizeNumber(
  value: number | string | undefined,
): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
