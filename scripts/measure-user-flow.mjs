/* global process */
import { createGzip } from "node:zlib";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";
import { startFlow } from "lighthouse";

const root = new URL("../dist", import.meta.url).pathname;
const chromium = process.env.CHROME_BIN || "/usr/bin/chromium";
const port = Number(process.env.PI_WEB_FLOW_PORT || 48733);
const outDir = process.env.PI_WEB_FLOW_DIR || "/tmp/pi-web-lighthouse-flow";
const url = `http://127.0.0.1:${port}/`;
const optionalBudget = (value) => (value === undefined ? null : Number(value));
const budgets = {
  minNavigationScore: optionalBudget(process.env.PI_WEB_FLOW_MIN_NAV_SCORE),
  maxNavigationLcp: optionalBudget(process.env.PI_WEB_FLOW_MAX_NAV_LCP),
  maxNavigationTbt: optionalBudget(process.env.PI_WEB_FLOW_MAX_NAV_TBT),
  maxInteractionTbt: Number(process.env.PI_WEB_FLOW_MAX_INTERACTION_TBT || 250),
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
  "/api/workspaces": { workspaces: [{ id: "w1", name: "measure", path: root, sessions: [{ id: "s1", title: "startup", workspaceId: "w1" }], sessionCount: 1, lastUsed: "now" }] },
  "/api/workspaces/w1/files": { files: [{ name: "src", path: "src", kind: "dir", children: [{ name: "main.ts", path: "src/main.ts", kind: "file" }] }] },
  "/api/workspaces/w1/files/src%2Fmain.ts": { path: "src/main.ts", mime: "text/typescript", previewKind: "text", content: "export const value = 1;\n" },
  "/api/workspaces/w1/git/status": { branch: "main", dirty: 0, files: {} },
  "/api/workspaces/w1/commands": { commands: [{ command: "/help", scope: "global", source: "test", description: "help" }] },
  "/api/workspaces/w1/runtime/status": { status: {} },
  "/api/workspaces/w1/settings": { settings: { project: {}, global: {}, effective: {}, paths: {} } },
  "/api/workspaces/w1/models": { providers: [] },
  "/api/auth/providers": { providers: [] },
  "/api/auth/oauth/providers": { providers: [] },
  "/api/sessions/s1": { session: { id: "s1", title: "startup", workspaceId: "w1" }, messages: [], status: "idle", cursor: "", hasMore: false },
  "/api/version": { current: "test", latest: "test", updateAvailable: false },
};

function serveFile(requestUrl, res) {
  const pathname = decodeURIComponent(new URL(requestUrl, url).pathname);
  const clean = normalize(pathname).replace(/^\.\.(\/|\\|$)/, "");
  const candidate = join(root, clean === "/" ? "index.html" : clean);
  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
  const type = mime[extname(file)] || "application/octet-stream";
  if ([".html", ".js", ".css", ".svg", ".json"].includes(extname(file))) {
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
    const pathname = new URL(req.url || "/", url).pathname;
    if (pathname.startsWith("/api/")) {
      const body = api[pathname];
      if (!body) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: `unexpected user-flow API call: ${pathname}` }));
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

async function clickIfVisible(page, selector) {
  const clicked = await page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    element.click();
    return true;
  }, selector);
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!clicked) throw new Error(`user-flow selector not clickable: ${selector}`);
}

function stepMode(step) {
  if (step.name?.startsWith("Navigation report")) return "navigation";
  if (step.name?.startsWith("Timespan report")) return "timespan";
  if (step.name?.startsWith("Snapshot report")) return "snapshot";
  return "unknown";
}

function summarizeFlow(flowResult) {
  return flowResult.steps.map((step) => ({
    name: step.name,
    mode: stepMode(step),
    score: step.lhr.categories.performance?.score,
    fcp: step.lhr.audits["first-contentful-paint"]?.numericValue ?? null,
    lcp: step.lhr.audits["largest-contentful-paint"]?.numericValue ?? null,
    tbt: step.lhr.audits["total-blocking-time"]?.numericValue ?? null,
    cls: step.lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
  }));
}

function enforceFlowBudgets(summary) {
  const failures = [];
  const navigation = summary[0];
  for (const key of ["score", "lcp", "tbt", "cls"]) {
    if (!Number.isFinite(navigation?.[key])) failures.push(`navigation ${key} missing`);
  }
  if (Number.isFinite(budgets.minNavigationScore) && Number.isFinite(navigation?.score) && navigation.score < budgets.minNavigationScore) failures.push(`navigation score ${navigation.score} < ${budgets.minNavigationScore}`);
  if (Number.isFinite(budgets.maxNavigationLcp) && Number.isFinite(navigation?.lcp) && navigation.lcp > budgets.maxNavigationLcp) failures.push(`navigation LCP ${navigation.lcp} > ${budgets.maxNavigationLcp}`);
  if (Number.isFinite(budgets.maxNavigationTbt) && Number.isFinite(navigation?.tbt) && navigation.tbt > budgets.maxNavigationTbt) failures.push(`navigation TBT ${navigation.tbt} > ${budgets.maxNavigationTbt}`);
  const interactionSteps = summary.slice(1).filter((item) => item.mode === "timespan");
  if (!interactionSteps.length) failures.push("interaction timespan steps missing");
  for (const step of interactionSteps) {
    if (!Number.isFinite(step.tbt)) failures.push(`${step.name} TBT missing`);
    else if (step.tbt > budgets.maxInteractionTbt) failures.push(`${step.name} TBT ${step.tbt} > ${budgets.maxInteractionTbt}`);
  }
  return failures;
}

mkdirSync(outDir, { recursive: true });
const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
try {
  const page = await browser.newPage();
  const flow = await startFlow(page, { name: "pi-web critical user flow" });

  await flow.navigate(url, { stepName: "startup" });
  await flow.startTimespan({ stepName: "open settings" });
  await clickIfVisible(page, "[data-action='open-settings']");
  await flow.endTimespan();
  await flow.startTimespan({ stepName: "open plugin sidebar" });
  await page.evaluate(() => {
    const app = document.querySelector("pi-app");
    app?.toggleTree?.(true);
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await flow.endTimespan();
  await flow.snapshot({ stepName: "post interaction snapshot" });

  const flowResult = await flow.createFlowResult();
  const html = await flow.generateReport();
  const summary = summarizeFlow(flowResult);
  writeFileSync(join(outDir, "flow.report.html"), html);
  writeFileSync(join(outDir, "flow.result.json"), JSON.stringify(flowResult, null, 2));
  writeFileSync(join(outDir, "flow.summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ outDir, budgets, summary }, null, 2));
  const failures = enforceFlowBudgets(summary);
  if (failures.length) {
    console.error(`Lighthouse user-flow budget failed:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
