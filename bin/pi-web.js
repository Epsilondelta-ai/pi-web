#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import https from "node:https";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const executableName = process.platform === "win32" ? "pi-web.exe" : "pi-web";

try {
  const executable = process.env.PI_WEB_BINARY || join(packageRoot, "vendor", platformKey(), executableName);
  if (!existsSync(executable)) await installReleaseBinary(executable);
  const child = spawn(executable, process.argv.slice(2), {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function platformKey() {
  return `${goos()}-${goarch()}`;
}

function goos() {
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "darwin";
  throw new Error(`pi-web npm launcher does not support ${process.platform}`);
}

function goarch() {
  if (process.arch === "x64") return "amd64";
  if (process.arch === "arm64") return "arm64";
  throw new Error(`pi-web npm launcher does not support ${process.arch}`);
}

async function installReleaseBinary(target) {
  const version = packageJson.version;
  const asset = `pi-web_${version}_${goos()}_${goarch()}.tar.gz`;
  const url = `https://github.com/Epsilondelta-ai/pi-web/releases/download/v${version}/${asset}`;
  const dir = mkdtempSync(join(tmpdir(), "pi-web-install-"));
  const archive = join(dir, asset);
  const outDir = join(dir, "out");
  mkdirSync(outDir);
  try {
    console.error(`Downloading pi-web ${version} for ${platformKey()}...`);
    await download(url, archive);
    const tar = spawnSync("tar", ["-xzf", archive, "-C", outDir], { stdio: "pipe" });
    if (tar.status !== 0) throw new Error((tar.stderr?.toString() || "failed to extract pi-web release").trim());
    mkdirSync(dirname(target), { recursive: true });
    renameSync(join(outDir, executableName), target);
    chmodSync(target, 0o755);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function download(url, destination, redirects = 0) {
  if (redirects > 5) throw new Error("too many redirects while downloading pi-web release");
  await new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        resolve(download(new URL(response.headers.location, url).toString(), destination, redirects + 1));
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`failed to download pi-web release: HTTP ${status}`));
        return;
      }
      pipeline(response, createWriteStream(destination)).then(resolve, reject);
    });
    request.on("error", reject);
  });
}
