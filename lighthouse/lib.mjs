// What the Lighthouse run (US-208) is made of, apart from running it: the configuration given to Lighthouse CI, the table the run
// creates, the summary it prints, and the two attempts a budget gets. No network and no browser here, so that node --test checks it.
import { readFileSync } from "node:fs";

/** The mobile profile of Lighthouse, written out so that a change of Lighthouse's default does not move the budgets: a 4× slower CPU and slow 4G. */
export const MOBILE = {
  formFactor: "mobile",
  screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  throttlingMethod: "simulate",
  throttling: { rttMs: 150, throughputKbps: 1638.4, requestLatencyMs: 562.5, downloadThroughputKbps: 1474.56, uploadThroughputKbps: 675, cpuSlowdownMultiplier: 4 },
  onlyCategories: ["performance"]
};

/** The three screens of the story: the home page, the setup sheet, and a solo table (its id is known once the run has made it). */
export function pages(base, tableId) {
  return [`${base}/`, `${base}/play/bot`, `${base}/play/bot/bidding/${tableId}`];
}

/** The request that makes the solo table of the third page: the setup sheet's defaults (setup-form.ts). */
export const SOLO_TABLE = { kind: "LOCAL", difficulty: "RELAXED", variant: "CLASSIC", announcements: true, allTrumps: true, target: 1000 };

/** The configuration file's budgets, with what the run decides: the pages, the browser and the folder of the reports. */
export function configure(rc, { urls, chromePath, outputDir }) {
  const flags = ["--no-sandbox", "--headless=new", "--disable-gpu"];
  return {
    ci: {
      ...rc.ci,
      collect: {
        ...rc.ci.collect,
        url: urls,
        // Lighthouse CI resolves the script from the folder it is run in (run.mjs runs it from here).
        puppeteerScript: "./session.cjs",
        puppeteerLaunchOptions: { ...(chromePath ? { executablePath: chromePath } : {}), args: flags, headless: "new" },
        settings: { ...rc.ci.collect.settings, ...MOBILE }
      },
      upload: { target: "filesystem", outputDir }
    }
  };
}

/** Runs `once` until it passes, at most `attempts` times: a budget blocks only when it fails twice in a row. Resolves to the outcomes. */
export async function withAttempts(once, attempts = 2) {
  const outcomes = [];
  for (let i = 0; i < attempts; i++) {
    const outcome = await once(i + 1);
    outcomes.push(outcome);
    if (outcome.passed) break;
  }
  return outcomes;
}

/** The budgets that failed, from Lighthouse CI's assertion-results.json. */
export function failures(results) {
  return results.filter((r) => !r.passed && r.level === "error").map((r) => `${r.url} ${r.auditId}${r.auditProperty ? `:${r.auditProperty}` : ""}: ${r.actual} (${r.operator} ${r.expected})`);
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** A Markdown table of what the runs measured, the median of each page: the numbers to write into the budgets. */
export function summarize(reports) {
  const byUrl = new Map();
  for (const report of reports) byUrl.set(report.finalUrl ?? report.requestedUrl, [...(byUrl.get(report.finalUrl ?? report.requestedUrl) ?? []), report]);
  const rows = [...byUrl].map(([url, runs]) => {
    const audit = (id) => median(runs.map((r) => r.audits[id].numericValue));
    const size = (type) =>
      median(runs.map((r) => r.audits["resource-summary"].details.items.find((item) => item.resourceType === type)?.transferSize ?? 0));
    const score = median(runs.map((r) => r.categories.performance.score)) * 100;
    return `| ${new URL(url).pathname.replace(/[0-9a-f-]{36}/, ":table")} | ${score.toFixed(0)} | ${audit("largest-contentful-paint").toFixed(0)} | ${audit("total-blocking-time").toFixed(0)} | ${audit("cumulative-layout-shift").toFixed(3)} | ${size("script")} | ${size("stylesheet")} |`;
  });
  return ["| page | score | LCP ms | TBT ms | CLS | script bytes | style bytes |", "|---|---|---|---|---|---|---|", ...rows].join("\n");
}

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** The page with a script added to its head: the deliberate regression that the budgets must refuse (see run.mjs --sabotage). */
export function sabotage(html) {
  return html.replace("</head>", '<script src="/__sabotage.js"></script></head>');
}

/** A script of about 600 kB that keeps the main thread busy for a while: large to transfer, long to run. */
export function sabotageScript() {
  return `/*${"x".repeat(600_000)}*/\nconst until = Date.now() + 1500;\nwhile (Date.now() < until);\n`;
}
