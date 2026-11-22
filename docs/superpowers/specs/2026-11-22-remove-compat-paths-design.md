# Design: remove the compatibility paths of US-170 and the stream change (US-179)

## Goal

Two paths were kept for one release: the player token in the stream's URL (`?token=`, before stream tickets) and the stream
that sends a `snapshot` per change (before the numbered events of US-168). The new frontend uses neither: it opens the stream
with `?ticket=` and `events=1`. After this story the long-lived token is never read from a URL, and there is one stream.

## Decisions

- **`GET /api/tables/{id}/events` refuses `?token=`.** The query struct has no `token` field; the credential is the
  `Authorization: Bearer` header or a single-use `ticket`. A request with only `?token=` (a forged or a real token) is a 401,
  as one with no credential.
- **One stream.** The snapshot-per-change branch is deleted; the stream always sends a `snapshot` when it opens and then the
  numbered `event`s. `events=1` is still sent by the clients and is ignored (a client that omits it gets the numbered stream,
  not an error: refusing it would turn a harmless leftover into an outage). Nothing else of the stream changes.
- **A test of the clients.** `frontend-tests/stream-clients.test.cjs` scans the sources of the web app and of the Android app
  for stream URLs and requires `ticket=` and `events=1` and no `token=` in each (the Android app does not open the stream
  itself, it loads the web app).
- **Tests that used `?token=`** (`blocking.rs`, `sse.rs`, `event_stream.rs`) send the `Authorization` header. `sse.rs` read the
  snapshot that each change used to produce; it now reads the table in the `state` of the event that carries it.
- **Left as it is: the English `message` of the error bodies.** The story removes it with the contract files "in the same
  commit" and calls it a breaking change (`feat!:`); the brief of this work forbids a breaking change, `web/src/lib/api/client.ts`
  still reads the `message` as a fallback, and some 50 tests assert it. It goes with a later, announced major release, together
  with that fallback.

## Tests

- `sse.rs`: `?token=` with a forged or the real token is a 401; the header and the ticket open the stream.
- `event_stream.rs`: a stream opened without `events=1` is numbered (`snapshot` then `event`s with ids), and the earlier tests of
  the numbered stream pass with the header.
- `stream-clients.test.cjs`: the clients of the repository.
