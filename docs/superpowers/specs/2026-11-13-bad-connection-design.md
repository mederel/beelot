# The game no longer freezes on a bad connection

## Problem

Requests had no timeout, so a stalled one left the screen waiting for ever; reads were never repeated; and a failed load
at an open table sent the player out ("That table is no longer available"), as if the table had gone.

## Design

- `apiJson` gives up a request after 12 s and marks the failure `network` (also for a 502, 503 or 504).
- A read (GET) is repeated after 0.5 s, 1.5 s and 3.5 s before the failure is shown. A move is never sent twice.
- `api.act`: after a move without an answer, the table is read again; a newer version means the move arrived and its
  snapshot is used, otherwise the failure is reported.
- A failed load at a table, a bidding screen or a private table keeps the player there and loads again after 3 s
  (`retryOnNetworkError`) instead of navigating away; only a real refusal still does.
- A note ("The connection is slow or lost. Retrying…", French and Dutch too) shows while requests fail and hides on the next
  success. The table is read again when the browser comes back online and when the app returns to the front.
- WebSockets were considered and not used: the stream (server-sent events) reconnects by itself, moves are requests, and the
  freeze came from missing timeouts and retries that a WebSocket would also need.

## Tests

`bad-connection.test.cjs` checks the wiring (timeout, GET-only retries, the move check, five loaders, the note, the
translations). No real network failure was simulated and no browser was used.
