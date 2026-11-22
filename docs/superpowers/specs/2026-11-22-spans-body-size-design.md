# Design: let the spans route take its own body size (US-189)

## Goal

`POST /api/telemetry/spans` carries up to a hundred spans, well over 4 KiB. The route sets its own 64 KiB limit, but the
global request-size layer (`max_request_bytes`, 4 KiB) wraps the whole router and answers 413 first, so the browser's spans
are lost without a sign.

## Decisions

- **The global limit picks its size by path.** `limits::size` becomes a middleware: the spans route gets
  `browser_traces::MAX_BODY` (64 KiB), every other route `max_request_bytes`. A declared `Content-Length` over the limit is
  refused at once with the usual 413 error body; a body without a length is wrapped in `http_body_util::Limited`, so the
  handler's read fails and `ApiJson` answers 413.
- **The client sends at most what the server accepts.** `flush` sends the pending spans in requests of at most 100
  (`MAX_SPANS_PER_REQUEST`), several when it holds more (it keeps up to 200).
- **Not changed.** The route's own `DefaultBodyLimit`, the 100-span cap on the server, the span checks.

## Tests

- Server: 50 realistic spans (over 4 KiB) with traces on get 204 (fails before the fix with 413); a 70 KB body still gets 413.
- `limits::size` unit tests: another path keeps the global limit, the spans path has its own.
- Frontend: 250 spans pending make requests of 100, 100 and 50.
