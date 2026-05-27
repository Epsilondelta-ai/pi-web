import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type WebStatusInput = {
  model: string;
  quotaText?: string;
};

export async function persistWebStatus(
  ctx: Pick<ExtensionContext, "cwd">,
  input: WebStatusInput,
): Promise<void> {
  const piDirectory = join(ctx.cwd, ".pi");
  const quotas = parseQuotaText(input.quotaText);
  await mkdir(piDirectory, { recursive: true });
  const settingsPath = join(piDirectory, "pi-web.json");
  const settings = await readJsonObject(settingsPath);
  settings.status = {
    model: input.model,
    ...quotas,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  await removeLegacyWebStatus(join(piDirectory, "web-status.json"));
}

export function parseQuotaText(
  quotaText: string | undefined,
): { fiveHourQuota?: number; weeklyQuota?: number } {
  return {
    fiveHourQuota: parseQuotaPercent(quotaText, /(?:^|\|)\s*5h\s+[🔋🪫]\((\d+)%\)/i),
    weeklyQuota: parseQuotaPercent(quotaText, /(?:^|\|)\s*Week\s+[🔋🪫]\((\d+)%\)/i),
  };
}

async function removeLegacyWebStatus(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    return;
  }
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function parseQuotaPercent(text: string | undefined, pattern: RegExp): number | undefined {
  const match = text?.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}
