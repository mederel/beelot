# Design: traces from the browser (US-158)

- **Off by default.** `BEELOT_BROWSER_TRACES=true` and exported traces. `/api/version` tells the client (`browserTraces`);
  `version-label.js` then adds `<script src="/telemetry.js">`, so with it off the script is never fetched. The route answers 404.
- **Client.** `telemetry.js` wraps `fetch` for same-origin `/api/` calls (adding `traceparent`) and `WebSocket`, listens for
  `error` and `unhandledrejection`, batches the spans in memory (200 at most, every 5 s and on `pagehide`) and posts them to
  `/api/telemetry/spans`. Every field is written in the file. No cookie or storage.
- **Route.** JSON `{spans:[…]}`, 64 KiB and 100 spans at most, CSRF and the per-client limit of every API route. Each span is
  checked (ids in lowercase hex and not zero, kind, method on the metrics' list, route rebuilt, times coherent, error type
  letters only) and dropped if not. Unknown fields are ignored when reading.
- **Export.** A second tracer provider, with the resource `service.name=beelot-web`, sharing the endpoint variables. The span
  gets the client's trace and span identifiers (so the server's request span is its child), a root context, and the client's
  times. An error is a span `browser error` with an `exception` event holding the type.
- **Privacy.** The policy gains a "Diagnostics" section.
