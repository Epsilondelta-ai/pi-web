import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type WebStatusInput = {
  model: string;
  quotaText?: string;
};

export async function persistWebStatus(
  ctx: Pick<ExtensionContext, "cwd">,
  input: WebStatusInput,
): Promise<void> {
  const dir = join(ctx.cwd, ".pi");
  const quotas = parseQuotaText(input.quotaText);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "web-status.json"),
    JSON.stringify(
      {
        model: input.model,
        ...quotas,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function parseQuotaText(
  quotaText: string | undefined,
): { fiveHourQuota?: number; weeklyQuota?: number } {
  return {
    fiveHourQuota: parseQuotaPercent(quotaText, /(?:^|\|)\s*5h\s+[🔋🪫]\((\d+)%\)/i),
    weeklyQuota: parseQuotaPercent(quotaText, /(?:^|\|)\s*Week\s+[🔋🪫]\((\d+)%\)/i),
  };
}

function parseQuotaPercent(text: string | undefined, pattern: RegExp): number | undefined {
  const match = text?.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}
