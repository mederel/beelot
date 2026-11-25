// Lighthouse CI against the built page served by a running Beelot server (US-208).
//
//   node run.mjs                 the budgets of lighthouserc.json on the home page, the setup sheet and a solo table
//   node run.mjs --sabotage      the same through a proxy that adds a large script: it must FAIL the budgets, and the exit is 0 only then
//
// The server is at BEELOT_URL (default http://localhost:8080); the browser is CHROME_PATH (default: Lighthouse CI finds Chrome).
// A budget blocks only when it fails twice in a row (the budgets are rounded up on purpose, and a runner is noisy). The reports are
// in .lighthouseci/reports and the medians are printed, and written to the job's summary when GitHub gives one.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { configure, failures, pages, readJson, sabotage, sabotageScript, SOLO_TABLE, summarize, withAttempts } from "./lib.mjs";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const server = (process.env.BEELOT_URL ?? "http://localhost:8080").replace(/\/$/, "");
const sabotaged = process.argv.includes("--sabotage");
const work = here(".lighthouseci");
const PROXY_PORT = 8099;

/** A solo table of the server, as the setup sheet makes one: its id and the token of the player who sits at it. */
async function makeTable() {
  const response = await fetch(`${server}/api/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.208.0.1" },
    body: JSON.stringify(SOLO_TABLE)
  });
  if (!response.ok) throw new Error(`the server refused to make a solo table: ${response.status} ${await response.text()}`);
  return response.json();
}

/** The server behind a proxy that adds a large, slow script to every page: the regression the budgets must refuse. */
function sabotageProxy() {
  const target = new URL(server);
  const proxy = createServer((req, res) => {
    if (req.url === "/__sabotage.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" }).end(sabotageScript());
      return;
    }
    const upstream = request(
      { host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host, "accept-encoding": "identity" } },
      (answer) => {
        if (!String(answer.headers["content-type"]).includes("text/html")) {
          res.writeHead(answer.statusCode, answer.headers);
          answer.pipe(res);
          return;
        }
        const chunks = [];
        answer.on("data", (chunk) => chunks.push(chunk));
        answer.on("end", () => {
          // The page is asked for as it is, but a server may compress it anyway.
          const sent = Buffer.concat(chunks);
          const html = answer.headers["content-encoding"] === "gzip" ? gunzipSync(sent) : sent;
          const body = Buffer.from(sabotage(html.toString("utf8")));
          const { "content-encoding": _encoding, ...headers } = answer.headers;
          res.writeHead(answer.statusCode, { ...headers, "content-length": body.length }).end(body);
        });
      }
    );
    req.pipe(upstream);
  });
  return new Promise((resolve) => proxy.listen(PROXY_PORT, "127.0.0.1", () => resolve(proxy)));
}

const lhci = (config) =>
  new Promise((resolve) => {
    const child = spawn(here("node_modules/.bin/lhci"), ["autorun", `--config=${config}`], { stdio: "inherit", env: process.env, cwd: here(".") });
    child.on("close", (code) => resolve(code ?? 1));
  });

const table = await makeTable();
process.env.BEELOT_LH_TABLE_ID = table.tableId;
process.env.BEELOT_LH_TABLE_TOKEN = table.playerToken;
const proxy = sabotaged ? await sabotageProxy() : null;
const base = sabotaged ? `http://127.0.0.1:${PROXY_PORT}` : server;

const rc = readJson(here("lighthouserc.json"));
const outputDir = `${work}/reports`;
const config = `${work}/rc.json`;

const outcomes = await withAttempts(async (attempt) => {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(config, JSON.stringify(configure(rc, { urls: pages(base, table.tableId), chromePath: process.env.CHROME_PATH, outputDir })));
  console.log(`\n=== attempt ${attempt}${sabotaged ? " (sabotaged)" : ""} ===`);
  const code = await lhci(config);
  let broken = [];
  try {
    broken = failures(readJson(`${work}/assertion-results.json`));
  } catch {
    /* no assertion results: the run itself failed */
  }
  return { passed: code === 0, broken, code };
});
proxy?.close();

try {
  const reports = readdirSync(outputDir)
    .filter((name) => /\.report\.json$/.test(name))
    .map((name) => readJson(`${outputDir}/${name}`));
  const summary = summarize(reports);
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lighthouse${sabotaged ? " (sabotaged)" : ""}\n\n${summary}\n`);
} catch (error) {
  console.log(`no report to summarize: ${error.message}`);
}

const last = outcomes.at(-1);
if (sabotaged) {
  // The regression must have been refused by a budget, not by a failure of the run itself.
  const refused = !last.passed && last.broken.length > 0;
  console.log(refused ? `\nthe budgets refused the regression:\n  ${last.broken.join("\n  ")}` : "\nthe budgets let the regression through");
  process.exit(refused ? 0 : 1);
}
if (!last.passed) {
  console.log(`\nthe budgets failed ${outcomes.length} times in a row:\n  ${last.broken.join("\n  ") || `Lighthouse CI exited with ${last.code}`}`);
  process.exit(1);
}
if (outcomes.length > 1) console.log(`\nthe budgets passed on the second attempt (the first: ${outcomes[0].broken.join("; ")})`);
