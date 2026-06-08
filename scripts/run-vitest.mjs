import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const storageDir = mkdtempSync(join(tmpdir(), "pi-web-vitest-localstorage-"));
const storageFile = join(storageDir, "localstorage.json");
const escapedStorageFile = storageFile.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const existingNodeOptions = process.env.NODE_OPTIONS || "";
const nodeOptions = [existingNodeOptions, `--localstorage-file="${escapedStorageFile}"`].filter(Boolean).join(" ");

const result = spawnSync("vitest", process.argv.slice(2), {
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  shell: process.platform === "win32",
  stdio: "inherit",
});

rmSync(storageDir, { force: true, recursive: true });

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
