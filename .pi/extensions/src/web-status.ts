import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

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
  await removeStaleTempFiles(path);
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  const data = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(data, "utf8");
  } finally {
    await handle.close();
  }
  try {
    await rename(tempPath, path);
  } catch (error) {
    await unlinkTempFile(tempPath);
    throw error;
  }
}

async function removeStaleTempFiles(path: string): Promise<void> {
  const directory = dirname(path);
  const prefix = `${basename(path)}.tmp-`;
  const now = Date.now();
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return;
  }
  await Promise.all(names
    .filter((name) => name.startsWith(prefix))
    .map(async (name) => {
      const tempPath = join(directory, name);
      try {
        const info = await stat(tempPath);
        if (now - info.mtimeMs > 60_000) await unlink(tempPath);
      } catch {
        return;
      }
    }));
}

async function unlinkTempFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    return;
  }
}

function parseQuotaPercent(text: string | undefined, pattern: RegExp): number | undefined {
  const match = text?.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}
