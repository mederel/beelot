// The browser's share of the traces (US-158). Loaded by version-label.js only when the server says it exports traces and
// the operator turned this on (BEELOT_BROWSER_TRACES). It makes one span per call to /api/ and one per WebSocket, puts
// the W3C `traceparent` header on the calls so the server's span is the child of the browser's, and sends the finished
// spans to /api/telemetry/spans, which forwards them: the browser never knows the collector. What a span holds is written
// in this file and nowhere else: the method, the route with every segment that could be an identifier replaced, the status,
// whether the call failed, and the kind of client (`android-app` when the Trusted Web Activity opened the page, `web`
// otherwise: US-162). No cookie, storage or identifier outlives the page.
import { csrfToken } from "$lib/api/csrf";

export const SPANS_PATH = "/api/telemetry/spans";
const FLUSH_MS = 5000;
const MAX_PENDING = 200;
const MAX_ROUTE = 64;

function randomHex(bytes: any, random: any) {
  const data = new Uint8Array(bytes);
  random(data);
  return Array.from(data, (byte: any) => byte.toString(16).padStart(2, "0")).join("");
}

export function newTraceId(random: any) {
  return randomHex(16, random);
}

export function newSpanId(random: any) {
  return randomHex(8, random);
}

export function traceparent(traceId: any, spanId: any) {
  return `00-${traceId}-${spanId}-01`;
}

// The route of a path: the query string is dropped and a segment that has a digit or is long (a table id, a token, a
// name) becomes {id}, so what is sent never says which table, account or match it was.
export function routeOf(path: any) {
  const clean = String(path).split(/[?#]/)[0];
  const route = clean
    .split("/")
    .map((segment: any) => (/\d/.test(segment) || segment.length > 24 ? "{id}" : segment))
    .join("/");
  return route.slice(0, MAX_ROUTE);
}

// Only the name of an error's type is kept, never its message or stack.
export function errorType(error: any) {
  const name = error && typeof error.name === "string" ? error.name : "";
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

export function apiPath(input: any, origin: any) {
  const text = typeof input === "string" ? input : input && typeof input.url === "string" ? input.url : String(input);
  let url: URL;
  try {
    url = new URL(text, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !url.pathname.startsWith("/api/") || url.pathname === SPANS_PATH) return null;
  return url.pathname;
}

// The app is a Trusted Web Activity: Chrome gives the page it opens a referrer that starts with `android-app://`. Read once
// when the script loads; nothing is stored. A reload inside the app has the site as referrer and counts as `web`.
export function platformOf(referrer: any) {
  return typeof referrer === "string" && referrer.startsWith("android-app://") ? "android-app" : "web";
}

export function fetchSpan({ traceId, spanId, method, path, startMs, endMs, status, failed, platform }: any) {
  return { kind: "fetch", traceId, spanId, method, route: routeOf(path), startMs, endMs, status, failed, platform };
}

export function webSocketSpan({ traceId, spanId, path, startMs, endMs, failed, platform }: any) {
  return { kind: "websocket", traceId, spanId, method: "GET", route: routeOf(path), startMs, endMs, status: 0, failed, platform };
}

export function errorSpan({ traceId, spanId, type, now, platform }: any) {
  return { kind: "error", traceId, spanId, errorType: type, startMs: now, endMs: now, platform };
}

export function install(win: any) {
  const origin = win.location.origin;
  const random = (data: any) => win.crypto.getRandomValues(data);
  const platform = platformOf(win.document?.referrer);
  const nativeFetch = win.fetch.bind(win);
  const pending: any[] = [];
  let timer: any = null;

  function csrfHeaders() {
    const token = csrfToken(win.document.cookie || "");
    return token ? { "X-XSRF-TOKEN": token } : {};
  }

  function flush() {
    timer = null;
    if (pending.length === 0) return;
    const spans = pending.splice(0, pending.length);
    nativeFetch(SPANS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ spans }),
      keepalive: true
    }).catch(() => {});
  }

  function record(span: any) {
    if (pending.length >= MAX_PENDING) return;
    pending.push(span);
    if (timer === null) timer = win.setTimeout(flush, FLUSH_MS);
  }

  win.fetch = function tracedFetch(input: any, init: any) {
    const path = apiPath(input, origin);
    if (path === null) return nativeFetch(input, init);
    const traceId = newTraceId(random);
    const spanId = newSpanId(random);
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const headers = new win.Headers(init?.headers || input?.headers || undefined);
    headers.set("traceparent", traceparent(traceId, spanId));
    const startMs = Date.now();
    const finish = (status: any, failed: any) => record(fetchSpan({ traceId, spanId, method, path, startMs, endMs: Date.now(), status, failed, platform }));
    return nativeFetch(input, { ...init, headers }).then(
      (response: any) => {
        finish(response.status, !response.ok);
        return response;
      },
      (error: any) => {
        finish(0, true);
        throw error;
      }
    );
  };

  const NativeWebSocket = win.WebSocket;
  if (NativeWebSocket) {
    win.WebSocket = function TracedWebSocket(url: any, protocols: any) {
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
      socket.addEventListener("close", () => record(webSocketSpan({ traceId, spanId, path, startMs, endMs: Date.now(), failed, platform })));
      return socket;
    };
    win.WebSocket.prototype = NativeWebSocket.prototype;
    for (const name of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) win.WebSocket[name] = NativeWebSocket[name];
  }

  win.addEventListener("error", (event: any) =>
    record(errorSpan({ traceId: newTraceId(random), spanId: newSpanId(random), type: errorType(event.error), now: Date.now(), platform }))
  );
  win.addEventListener("unhandledrejection", (event: any) =>
    record(errorSpan({ traceId: newTraceId(random), spanId: newSpanId(random), type: errorType(event.reason), now: Date.now(), platform }))
  );
  win.addEventListener("pagehide", flush);
}
