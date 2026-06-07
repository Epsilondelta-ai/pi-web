import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const roots = process.argv.slice(2);

if (roots.length === 0) {
  throw new Error("usage: node scripts/clean-generated-js.mjs <dir> [...dir]");
}

async function cleanDirectory(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) {
      continue;
    }

    const path = join(entry.parentPath, entry.name);
    const source = await readFile(path, "utf8");
    const cleaned = source
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");

    if (cleaned !== source) {
      await writeFile(path, cleaned);
    }
  }
}

await Promise.all(roots.map((root) => cleanDirectory(root)));
