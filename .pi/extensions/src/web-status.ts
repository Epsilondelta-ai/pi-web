import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
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
  if (!settings) return;
  settings.status = {
    model: input.model,
    ...quotas,
    updatedAt: new Date().toISOString(),
  };
  await writePrivateJson(settingsPath, settings);
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

async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    return undefined;
  }
}

async function writePrivateJson(path: string, value: Record<string, unknown>): Promise<void> {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  const data = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(data, "utf8");
  } finally {
    await handle.close();
  }
  await rename(tempPath, path);
}

function parseQuotaPercent(text: string | undefined, pattern: RegExp): number | undefined {
  const match = text?.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}
