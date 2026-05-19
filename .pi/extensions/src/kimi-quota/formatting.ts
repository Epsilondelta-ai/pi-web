import type { KimiQuotaSnapshot, KimiQuotaWindow } from "./types";

export function formatKimiQuotaFooterText(
  snapshot: KimiQuotaSnapshot,
): string | undefined {
  if (snapshot.kind === "kimi-code")
    return formatKimiCodeUsageFooterText(snapshot);
  return formatKimiBalanceFooterText(snapshot);
}

export function formatKimiBalanceFooterText(
  snapshot: KimiQuotaSnapshot,
): string | undefined {
  if (snapshot.availableBalance === undefined) return undefined;
  const parts = [`Kimi: ${formatCurrency(snapshot.availableBalance)} left`];
  if (snapshot.voucherBalance !== undefined)
    parts.push(`voucher ${formatCurrency(snapshot.voucherBalance)}`);
  if (snapshot.cashBalance !== undefined)
    parts.push(`cash ${formatCurrency(snapshot.cashBalance)}`);
  const text = parts.join(" · ");
  return snapshot.stale || snapshot.source === "cached"
    ? `${text} (cached)`
    : text;
}

function formatKimiCodeUsageFooterText(
  snapshot: KimiQuotaSnapshot,
): string | undefined {
  const windows = [snapshot.primary, snapshot.secondary]
    .filter((window): window is KimiQuotaWindow => Boolean(window))
    .map((window) => formatNativeWindow(window));
  if (windows.length === 0) return undefined;
  const text = windows.join(" | ");
  return snapshot.stale || snapshot.source === "cached"
    ? `${text} (cached)`
    : text;
}

function formatNativeWindow(window: KimiQuotaWindow): string {
  const remainingPercent = Math.round(clamp(100 - window.usedPercent, 0, 100));
  return `${windowDisplayLabel(window.label)} ${batteryIcon(remainingPercent)}(${remainingPercent}%)`;
}

function windowDisplayLabel(label: KimiQuotaWindow["label"]): string {
  return label === "5H:" ? "5h" : "Week";
}

function batteryIcon(remainingPercent: number): string {
  return remainingPercent <= 20 ? "🪫" : "🔋";
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
