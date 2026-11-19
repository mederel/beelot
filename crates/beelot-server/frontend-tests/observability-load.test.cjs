// US-161: load.sh loads every alert however late the first request comes. It runs against a small fake of the OpenObserve
// API and a fake `sleep` that only moves a virtual clock, so a stream that appears long after the start costs no time.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.join(__dirname, "../../..");
const loadScript = path.join(root, "packaging/observability/load.sh");
const hasTools = ["curl", "jq", "sh"].every((tool) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0);

// The fake OpenObserve: the lists of what was created, and the streams, which depend on the virtual clock.
function fakeOpenObserve(clockFile, { requestStreamAt }) {
  const state = { dashboards: [], templates: [], destinations: [], alerts: [], users: [], posts: [] };
  const clock = () => Number(fs.readFileSync(clockFile, "utf8").trim() || 0);
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const url = new URL(request.url, "http://x");
      const send = (value) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); };
      const created = (list, key) => {
        const item = JSON.parse(body);
        state.posts.push(`${request.method} ${url.pathname} ${item.name ?? ""}`);
        list.push({ ...item, alert_id: `${list.length + 1}` });
        return send({ code: 200, [key]: "ok" });
      };
      if (url.pathname === "/healthz") return send({ status: "ok" });
      if (url.pathname === "/api/default/streams") {
        const list = [{ name: "beelot_database_up" }];
        if (clock() >= requestStreamAt) list.push({ name: "http_server_request_duration_count" });
        return send({ list });
      }
      if (url.pathname === "/api/default/dashboards") return request.method === "POST" ? created(state.dashboards, "x") : send({ dashboards: state.dashboards });
      if (url.pathname === "/api/default/alerts/templates") return request.method === "POST" ? created(state.templates, "x") : send(state.templates);
      if (url.pathname === "/api/default/alerts/destinations") return request.method === "POST" ? created(state.destinations, "x") : send(state.destinations);
      if (url.pathname === "/api/default/users") return request.method === "POST" ? created(state.users, "x") : send({ data: state.users });
      if (url.pathname === "/api/v2/default/alerts") return request.method === "POST" ? created(state.alerts, "x") : send({ list: state.alerts });
      const one = url.pathname.match(/^\/api\/v2\/default\/alerts\/(.+)$/);
      if (one) return send(state.alerts.find((alert) => alert.alert_id === one[1]) ?? {});
      response.statusCode = 404;
      return response.end("{}");
    });
  });
  return { server, state };
}

async function runLoad({ env = {}, requestStreamAt, state: previous, clockStart = 0 }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "beelot-load-"));
  const clockFile = path.join(work, "clock");
  fs.writeFileSync(clockFile, String(clockStart));
  fs.mkdirSync(path.join(work, "bin"));
  // A `sleep` that adds its argument to the virtual clock and returns at once.
  fs.writeFileSync(path.join(work, "bin/sleep"), `#!/bin/sh\necho $(( $(cat "${clockFile}") + \${1%%.*} )) > "${clockFile}"\necho "$1" >> "${work}/sleeps"\n`, { mode: 0o755 });
  const { server, state } = fakeOpenObserve(clockFile, { requestStreamAt });
  if (previous) Object.assign(state, JSON.parse(JSON.stringify(previous)));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const child = spawn("sh", [loadScript], {
    cwd: work,
    env: { PATH: `${work}/bin:${process.env.PATH}`, OPENOBSERVE_URL: url, OPENOBSERVE_ROOT_EMAIL: "root@example.org",
      OPENOBSERVE_ROOT_PASSWORD: "secret", OPENOBSERVE_SETUP_INTERVAL: "30", ...env }
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
  const status = await new Promise((resolve) => child.on("close", resolve));
  clearTimeout(timer);
  await new Promise((resolve) => server.close(resolve));
  const sleeps = fs.existsSync(path.join(work, "sleeps")) ? fs.readFileSync(path.join(work, "sleeps"), "utf8").trim().split("\n").filter(Boolean) : [];
  return { status, output, state, sleeps, clock: Number(fs.readFileSync(clockFile, "utf8")) };
}

const names = (state) => state.alerts.map((alert) => alert.name).sort();
const allSix = ["beelot-database-down", "beelot-database-down-resolved", "beelot-error-share", "beelot-error-share-resolved",
  "beelot-no-telemetry", "beelot-no-telemetry-resolved"];

test("a request metric that appears long after the start still gets its alerts", { skip: !hasTools && "curl, jq and sh are needed" }, async () => {
  const result = await runLoad({ env: { OPENOBSERVE_ALERT_WEBHOOK_URL: "http://listener/alert" }, requestStreamAt: 400 });
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(names(result.state), allSix);
  assert.match(result.output, /the alert beelot-error-share is loaded/);
  assert.match(result.output, /the alert beelot-error-share-resolved is loaded/);
  assert.match(result.output, /all the alerts are loaded/);
  assert.doesNotMatch(result.output, /not loaded; check|run this again|after 3 minutes/);
  assert.ok(result.clock >= 400, "the script waited for the stream");
});

test("the log says what it waits for, not at every look", { skip: !hasTools && "curl, jq and sh are needed" }, async () => {
  const result = await runLoad({ env: { OPENOBSERVE_ALERT_WEBHOOK_URL: "http://listener/alert" }, requestStreamAt: 400 });
  const waiting = result.output.split("\n").filter((line) => line.startsWith("waiting for"));
  assert.ok(waiting.length >= 1, "it says what it waits for");
  assert.match(waiting[0], /beelot-error-share/);
  assert.match(waiting[0], /every 30 s/);
  // About 15 looks here (and 120 in an hour): the log stays well under that (a line when the set changes, one every ten minutes).
  assert.ok(waiting.length <= 8, `${waiting.length} waiting lines`);
  assert.ok(result.sleeps.length >= 10 && result.sleeps.every((seconds) => Number(seconds) >= 30), "every wait is the interval");
});

test("every alert is created once, and a second run changes nothing and does not wait", { skip: !hasTools && "curl, jq and sh are needed" }, async () => {
  const first = await runLoad({ env: { OPENOBSERVE_ALERT_WEBHOOK_URL: "http://listener/alert" }, requestStreamAt: 600 });
  assert.equal(first.status, 0, first.output);
  assert.equal(first.state.posts.filter((post) => /\/alerts beelot-error-share$/.test(post)).length, 1);
  const second = await runLoad({ env: { OPENOBSERVE_ALERT_WEBHOOK_URL: "http://listener/alert" }, requestStreamAt: 600, state: first.state, clockStart: 600 });
  assert.equal(second.status, 0, second.output);
  assert.equal(second.sleeps.length, 0);
  assert.equal(second.state.posts.length, first.state.posts.length);
  assert.equal((second.output.match(/already there/g) ?? []).length, 7);
});

test("without a destination only the three alerts that fire are loaded, the late one included", { skip: !hasTools && "curl, jq and sh are needed" }, async () => {
  const result = await runLoad({ requestStreamAt: 1200 });
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(names(result.state), ["beelot-database-down", "beelot-error-share", "beelot-no-telemetry"]);
  assert.match(result.output, /all the alerts are loaded/);
});

test("the dashboard and the alerts name the streams OpenObserve makes of the request metric", () => {
  // OpenObserve names a stream after the OTLP metric (dots become underscores, the unit is not added) and splits a histogram
  // into _count, _bucket, _sum, _min and _max: `http_server_request_duration_seconds_count` never exists.
  for (const file of ["beelot-dashboard.json", "beelot-alerts.json"]) {
    const text = fs.readFileSync(path.join(root, "packaging/observability", file), "utf8");
    assert.doesNotMatch(text, /duration_seconds/, file);
    const used = new Set(text.match(/http_server_request_duration\w*/g));
    assert.ok(used.size > 0, file);
    for (const name of used) assert.match(name, /^http_server_request_duration_(count|bucket|sum|min|max)$/, `${file}: ${name}`);
  }
});

test("the compose file keeps the setup service until it is done, and restarts it on failure only", () => {
  const compose = fs.readFileSync(path.join(root, "packaging/container/compose.yaml"), "utf8");
  const service = compose.slice(compose.indexOf("  openobserve-setup:"), compose.indexOf("\nvolumes:"));
  assert.match(service, /restart: on-failure/);
  assert.match(service, /OPENOBSERVE_SETUP_INTERVAL: \$\{OPENOBSERVE_SETUP_INTERVAL:-30\}/);
});

test("the CI script starts the setup, plays the match and fails when an alert is missing, without the old wait", () => {
  const script = fs.readFileSync(path.join(root, ".github/scripts/test-observability.sh"), "utf8");
  assert.match(script, /dc up -d openobserve-setup/);
  for (const name of allSix) assert.ok(script.includes(name) || script.includes("beelot-error-share"), name);
  assert.match(script, /all the alerts are loaded/);
  assert.match(script, /alerts missing after the match/);
});

test("the dashboard counts the browser's spans by platform, with the column names OpenObserve gives the attributes", () => {
  // Found on OpenObserve v1.1.2: `beelot.client.platform` becomes `beelot_client_platform`, the flag `beelot_client_error`.
  const dashboard = JSON.parse(fs.readFileSync(path.join(root, "packaging/observability/beelot-dashboard.json"), "utf8"));
  const panel = dashboard.tabs[0].panels.find((p) => p.title === "Requests and errors by platform");
  assert.ok(panel, "the panel is missing");
  assert.equal(panel.queryType, "sql");
  const [query] = panel.queries;
  assert.equal(query.fields.stream_type, "traces");
  for (const part of ["beelot_client_platform", "beelot_client_error", "service_name = 'beelot-web'"]) {
    assert.ok(query.query.includes(part), part);
  }
  const ids = dashboard.tabs[0].panels.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});
