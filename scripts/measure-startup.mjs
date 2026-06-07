/* global process */
import { createGzip } from "node:zlib";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import puppeteer from "puppeteer-core";

const root = new URL("../dist", import.meta.url).pathname;
const chromium = process.env.CHROME_BIN || "/usr/bin/chromium";
const tracePath = process.env.PI_WEB_TRACE || "/tmp/pi-web-startup-trace.json";
const port = Number(process.env.PI_WEB_MEASURE_PORT || 48732);
const throttle = process.env.PI_WEB_THROTTLE || "none";
const budgets = {
  firstContentfulPaint: Number(process.env.PI_WEB_BUDGET_FCP || 1200),
  domContentLoaded: Number(process.env.PI_WEB_BUDGET_DCL || 1800),
  load: Number(process.env.PI_WEB_BUDGET_LOAD || 2200),
  longTaskTotal: Number(process.env.PI_WEB_BUDGET_LONG_TASK_TOTAL || 0),
  totalJsDecoded: Number(process.env.PI_WEB_BUDGET_JS_DECODED || 600_000),
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const api = {
  "/api/health": { ok: true },
  "/api/workspaces/w1/files": { files: [{ name: "src", path: "src", kind: "dir", children: [{ name: "main.ts", path: "src/main.ts", kind: "file" }] }] },
  "/api/workspaces/w1/files/src%2Fmain.ts": { path: "src/main.ts", mime: "text/typescript", previewKind: "text", content: "export const value = 1;\n" },
  "/api/workspaces/w1/git/status": { branch: "main", dirty: 0, files: {} },
  "/api/workspaces/w1/commands": { commands: [] },
  "/api/workspaces/w1/runtime/status": { status: {} },
  "/api/workspaces/w1/settings": { settings: { project: {}, global: {}, effective: {}, paths: {} } },
  "/api/workspaces/w1/models": { providers: [] },
  "/api/auth/providers": { providers: [] },
  "/api/auth/oauth/providers": { providers: [] },
  "/api/workspaces/w1/sessions/s1": { session: { id: "s1", title: "startup", workspaceId: "w1" }, messages: [], status: "idle", cursor: "", hasMore: false },
  "/api/version": { current: "test", latest: "test", updateAvailable: false },
};

function serveFile(url, res) {
  const pathname = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const clean = normalize(pathname).replace(/^\.\.(\/|\\|$)/, "");
  const candidate = join(root, clean === "/" ? "index.html" : clean);
  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
  const type = mime[extname(file)] || "application/octet-stream";
  const acceptsGzip = [".html", ".js", ".css", ".svg", ".json"].includes(extname(file));
  if (acceptsGzip) {
    res.writeHead(200, { "content-type": type, "content-encoding": "gzip", vary: "Accept-Encoding" });
    const gzip = createGzip();
    gzip.end(readFileSync(file));
    gzip.pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(file));
}

function startServer() {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url || "/", `http://127.0.0.1:${port}`).pathname;
    if (pathname.startsWith("/api/")) {
      const body = api[pathname];
      if (!body) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: `unexpected startup API call: ${pathname}` }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      return;
    }
    serveFile(req.url || "/", res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

async function applyThrottling(page) {
  if (throttle === "none") return;
  const client = await page.target().createCDPSession();
  if (throttle === "mobile") {
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
}

function enforceBudgets(result) {
  const failures = [];
  for (const key of ["firstContentfulPaint", "domContentLoaded", "load", "longTaskTotal", "totalJsDecoded"]) {
    if (!Number.isFinite(result[key])) failures.push(`${key} missing`);
  }
  for (const [key, limit] of Object.entries(budgets)) {
    if (!Number.isFinite(limit) || !Number.isFinite(result[key])) continue;
    if (result[key] > limit) failures.push(`${key} ${result[key]} > ${limit}`);
  }
  return failures;
}

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: chromium,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await applyThrottling(page);
  await page.tracing.start({ path: tracePath, categories: ["devtools.timeline", "v8", "blink.user_timing", "loading"] });
  const response = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.tracing.stop();
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, Math.round(entry.startTime)]));
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      type: entry.initiatorType,
      start: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      transfer: Math.round(entry.transferSize || 0),
      encoded: Math.round(entry.encodedBodySize || 0),
      decoded: Math.round(entry.decodedBodySize || 0),
    }));
    const longTasks = performance.getEntriesByType("longtask").map((entry) => Math.round(entry.duration));
    return {
      status: document.readyState,
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      paints: paint,
      longTaskCount: longTasks.length,
      longTaskTotal: longTasks.reduce((sum, value) => sum + value, 0),
      resources,
    };
  });
  const js = metrics.resources.filter((entry) => entry.name.endsWith(".js"));
  const initialScripts = [...(await page.content()).matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  const result = {
    url: response?.url(),
    status: response?.status(),
    throttle,
    tracePath,
    budgets,
    initialScripts,
    domContentLoaded: metrics.domContentLoaded,
    load: metrics.load,
    firstContentfulPaint: metrics.paints["first-contentful-paint"] || null,
    longTaskCount: metrics.longTaskCount,
    longTaskTotal: metrics.longTaskTotal,
    jsRequests: js.map((entry) => ({ file: entry.name.split("/").pop(), start: entry.start, duration: entry.duration, transfer: entry.transfer, decoded: entry.decoded })),
    totalJsDecoded: js.reduce((sum, entry) => sum + entry.decoded, 0),
  };
  console.log(JSON.stringify(result, null, 2));
  const failures = enforceBudgets(result);
  if (failures.length) {
    console.error(`Performance budget failed:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
