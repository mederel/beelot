// The browser's share of the traces (US-158). Loaded by version-label.js only when the server says it exports traces and
// the operator turned this on (BEELOT_BROWSER_TRACES). It makes one span per call to /api/ and one per WebSocket, puts
// the W3C `traceparent` header on the calls so the server's span is the child of the browser's, and sends the finished
// spans to /api/telemetry/spans, which forwards them: the browser never knows the collector. What a span holds is written
// in this file and nowhere else: the method, the route with every segment that could be an identifier replaced, the status,
// whether the call failed. No cookie, storage or identifier outlives the page.
"use strict";

const SPANS_PATH = "/api/telemetry/spans";
const FLUSH_MS = 5000;
const MAX_PENDING = 200;
const MAX_ROUTE = 64;

function randomHex(bytes, random) {
  const data = new Uint8Array(bytes);
  random(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newTraceId(random) {
  return randomHex(16, random);
}

function newSpanId(random) {
  return randomHex(8, random);
}

function traceparent(traceId, spanId) {
  return `00-${traceId}-${spanId}-01`;
}

// The route of a path: the query string is dropped and a segment that has a digit or is long (a table id, a token, a
// name) becomes {id}, so what is sent never says which table, account or match it was.
function routeOf(path) {
  const clean = String(path).split(/[?#]/)[0];
  const route = clean
    .split("/")
    .map((segment) => (/\d/.test(segment) || segment.length > 24 ? "{id}" : segment))
    .join("/");
  return route.slice(0, MAX_ROUTE);
}

// Only the name of an error's type is kept, never its message or stack.
function errorType(error) {
  const name = error && typeof error.name === "string" ? error.name : "";
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

function apiPath(input, origin) {
  const text = typeof input === "string" ? input : input && typeof input.url === "string" ? input.url : String(input);
  let url;
  try {
    url = new URL(text, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !url.pathname.startsWith("/api/") || url.pathname === SPANS_PATH) return null;
  return url.pathname;
}

function fetchSpan({ traceId, spanId, method, path, startMs, endMs, status, failed }) {
  return { kind: "fetch", traceId, spanId, method, route: routeOf(path), startMs, endMs, status, failed };
}

function webSocketSpan({ traceId, spanId, path, startMs, endMs, failed }) {
  return { kind: "websocket", traceId, spanId, method: "GET", route: routeOf(path), startMs, endMs, status: 0, failed };
}

function errorSpan({ traceId, spanId, type, now }) {
  return { kind: "error", traceId, spanId, errorType: type, startMs: now, endMs: now };
}

function install(win) {
  const origin = win.location.origin;
  const random = (data) => win.crypto.getRandomValues(data);
  const nativeFetch = win.fetch.bind(win);
  const pending = [];
  let timer = null;

  function csrfHeaders() {
    const match = /(?:^|;\s*)XSRF-TOKEN=([^;]*)/.exec(win.document.cookie || "");
    return match ? { "X-XSRF-TOKEN": decodeURIComponent(match[1]) } : {};
  }

  function flush() {
    timer = null;
    if (pending.length === 0) return;
    const spans = pending.splice(0, pending.length);
    nativeFetch(SPANS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ spans }),
      keepalive: true,
    }).catch(() => {});
  }

  function record(span) {
    if (pending.length >= MAX_PENDING) return;
    pending.push(span);
    if (timer === null) timer = win.setTimeout(flush, FLUSH_MS);
  }

  win.fetch = function tracedFetch(input, init) {
    const path = apiPath(input, origin);
    if (path === null) return nativeFetch(input, init);
    const traceId = newTraceId(random);
    const spanId = newSpanId(random);
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    const headers = new win.Headers((init && init.headers) || (input && input.headers) || undefined);
    headers.set("traceparent", traceparent(traceId, spanId));
    const startMs = Date.now();
    const finish = (status, failed) =>
      record(fetchSpan({ traceId, spanId, method, path, startMs, endMs: Date.now(), status, failed }));
    return nativeFetch(input, { ...init, headers }).then(
      (response) => {
        finish(response.status, !response.ok);
        return response;
      },
      (error) => {
        finish(0, true);
        throw error;
      },
    );
  };

  const NativeWebSocket = win.WebSocket;
  if (NativeWebSocket) {
    win.WebSocket = function TracedWebSocket(url, protocols) {
      const socket = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
      let path = "";
      try {
        path = new URL(String(url), origin).pathname;
      } catch {
        path = "";
      }
      const traceId = newTraceId(random);
      const spanId = newSpanId(random);
      const startMs = Date.now();
      let failed = false;
      socket.addEventListener("error", () => {
        failed = true;
      });
      socket.addEventListener("close", () =>
        record(webSocketSpan({ traceId, spanId, path, startMs, endMs: Date.now(), failed })),
      );
      return socket;
    };
    win.WebSocket.prototype = NativeWebSocket.prototype;
    for (const name of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) win.WebSocket[name] = NativeWebSocket[name];
  }

  win.addEventListener("error", (event) =>
    record(errorSpan({ traceId: newTraceId(random), spanId: newSpanId(random), type: errorType(event.error), now: Date.now() })),
  );
  win.addEventListener("unhandledrejection", (event) =>
    record(errorSpan({ traceId: newTraceId(random), spanId: newSpanId(random), type: errorType(event.reason), now: Date.now() })),
  );
  win.addEventListener("pagehide", flush);
}

if (typeof window !== "undefined" && typeof document !== "undefined") install(window);

if (typeof module !== "undefined") {
  module.exports = { traceparent, routeOf, errorType, apiPath, fetchSpan, webSocketSpan, errorSpan, newTraceId, newSpanId, install, SPANS_PATH };
}
