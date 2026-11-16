"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const telemetry = require("../static/telemetry.js");

test("the traceparent header follows the W3C format", () => {
  const random = (data) => data.fill(0xab);
  const traceId = telemetry.newTraceId(random);
  const spanId = telemetry.newSpanId(random);
  assert.match(telemetry.traceparent(traceId, spanId), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
});

test("a route keeps the words and loses what could identify a table, an account or a match", () => {
  assert.equal(telemetry.routeOf("/api/tables/8f3a2c1d-0000/bid?token=abc"), "/api/tables/{id}/bid");
  assert.equal(telemetry.routeOf("/api/friends/ana-lucia-the-great-and-powerful"), "/api/friends/{id}");
  assert.equal(telemetry.routeOf("/api/version"), "/api/version");
  assert.ok(telemetry.routeOf("/api/" + "x".repeat(200)).length <= 64);
});

test("only the type of an error is kept, never its message", () => {
  assert.equal(telemetry.errorType(new TypeError("secret 1234")), "TypeError");
  assert.equal(telemetry.errorType({ name: "<script>" }), "Error");
  assert.equal(telemetry.errorType("a string"), "Error");
  assert.equal(telemetry.errorType(undefined), "Error");
});

test("only same-origin calls to the API are traced, and not the spans' own route", () => {
  const origin = "https://beelot.example";
  assert.equal(telemetry.apiPath("/api/version", origin), "/api/version");
  assert.equal(telemetry.apiPath("https://beelot.example/api/ratings?x=1", origin), "/api/ratings");
  assert.equal(telemetry.apiPath("https://other.example/api/version", origin), null);
  assert.equal(telemetry.apiPath("/static/app.js", origin), null);
  assert.equal(telemetry.apiPath(telemetry.SPANS_PATH, origin), null);
});

test("a span holds only the fields written for its kind", () => {
  const base = { traceId: "t".repeat(32), spanId: "s".repeat(16), startMs: 1, endMs: 2 };
  assert.deepEqual(
    Object.keys(telemetry.fetchSpan({ ...base, method: "POST", path: "/api/x/12", status: 200, failed: false, secret: "no" })).sort(),
    ["endMs", "failed", "kind", "method", "route", "spanId", "startMs", "status", "traceId"],
  );
  assert.deepEqual(
    Object.keys(telemetry.errorSpan({ traceId: base.traceId, spanId: base.spanId, type: "Error", now: 5, message: "no" })).sort(),
    ["endMs", "errorType", "kind", "spanId", "startMs", "traceId"],
  );
});

test("a traced call carries the traceparent and its span is sent in a batch", async () => {
  const calls = [];
  const timers = [];
  const win = {
    location: { origin: "https://beelot.example" },
    document: { cookie: "XSRF-TOKEN=abc" },
    crypto: { getRandomValues: (data) => data.fill(1) },
    Headers,
    fetch: async (input, init) => {
      calls.push({ input, init });
      return { status: 200, ok: true };
    },
    setTimeout: (callback) => timers.push(callback) && timers.length,
    addEventListener: () => {},
  };
  telemetry.install(win);
  await win.fetch("/api/version");
  assert.equal(calls[0].init.headers.get("traceparent"), "00-" + "01".repeat(16) + "-" + "01".repeat(8) + "-01");
  timers[0]();
  const sent = calls[1];
  assert.equal(sent.input, telemetry.SPANS_PATH);
  assert.equal(sent.init.headers["X-XSRF-TOKEN"], "abc");
  const body = JSON.parse(sent.init.body);
  assert.equal(body.spans.length, 1);
  assert.equal(body.spans[0].route, "/api/version");
  assert.equal(body.spans[0].status, 200);
});
