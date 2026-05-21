#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const executable = join(packageRoot, "vendor", process.platform === "win32" ? "pi-web.exe" : "pi-web");

if (!existsSync(executable)) {
  console.error("pi-web binary is missing. Reinstall with: npm install -g @epsilondelta-ai/pi-web");
  process.exit(1);
}

const child = spawn(executable, process.argv.slice(2), {
  stdio: "inherit",
  env: {
    ...process.env,
    PI_WEB_INSTALLER: "npm",
  },
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
