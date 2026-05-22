#!/usr/bin/env node
import { createWriteStream, existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { get } from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import packageJson from "../package.json" with { type: "json" };

const repo = process.env.PI_WEB_REPO ?? "Epsilondelta-ai/pi-web";
const version = process.env.PI_WEB_VERSION ?? `v${packageJson.version}`;
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const vendorDir = join(packageRoot, "vendor");
const binName = process.platform === "win32" ? "pi-web.exe" : "pi-web";
const destination = join(vendorDir, binName);
const sourceCheckoutMarker = join(packageRoot, "go.mod");

if (
  process.env.PI_WEB_SKIP_DOWNLOAD === "1" ||
  (existsSync(sourceCheckoutMarker) && process.env.PI_WEB_FORCE_DOWNLOAD !== "1")
) {
  process.exit(0);
}

function platformName(platform) {
  if (platform === "darwin") return "darwin";
  if (platform === "linux") return "linux";
  if (platform === "win32") return "windows";
  throw new Error(`unsupported platform: ${platform}`);
}

function archName(arch) {
  if (arch === "x64") return "amd64";
  if (arch === "arm64") return "arm64";
  throw new Error(`unsupported architecture: ${arch}`);
}

function assetName() {
  const os = platformName(process.platform);
  const arch = archName(process.arch);
  const ext = os === "windows" ? "zip" : "tar.gz";
  return `pi-web_${version.replace(/^v/, "")}_${os}_${arch}.${ext}`;
}

async function download(url, outputPath, redirects = 0) {
  if (redirects > 5) throw new Error(`too many redirects downloading ${url}`);
  await new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      const location = response.headers.location;
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && location) {
        response.resume();
        download(new URL(location, url).toString(), outputPath, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`download failed: ${response.statusCode} ${response.statusMessage ?? ""}`.trim()));
        return;
      }
      const file = createWriteStream(outputPath);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });
    request.on("error", reject);
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
}

function extract(archive, targetDir) {
  if (archive.endsWith(".zip")) {
    if (process.platform === "win32") {
      run("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -Force '${archive}' '${targetDir}'`]);
      return;
    }
    run("unzip", ["-q", archive, "-d", targetDir]);
    return;
  }
  run("tar", ["-xzf", archive, "-C", targetDir]);
}

async function install() {
  const asset = assetName();
  const url = `https://github.com/${repo}/releases/download/${version}/${asset}`;
  const tempDir = await mkdtemp(join(process.env.npm_config_tmp ?? process.env.TMPDIR ?? "/tmp", "pi-web-"));
  const archive = join(tempDir, asset);
  try {
    console.log(`Downloading ${url}`);
    await download(url, archive);
    extract(archive, tempDir);
    const extracted = join(tempDir, binName);
    if (!existsSync(extracted)) throw new Error(`${binName} not found in ${asset}`);
    await mkdir(vendorDir, { recursive: true });
    await copyFile(extracted, destination);
    if (process.platform !== "win32") await chmod(destination, 0o755);
    console.log(`Installed pi-web ${version} to ${destination}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

install().catch((error) => {
  console.error(`pi-web postinstall failed: ${error.message}`);
  console.error("Install a GitHub release manually or retry after the matching release assets are available.");
  process.exit(1);
});
