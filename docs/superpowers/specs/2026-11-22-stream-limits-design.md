# Design: limit the event streams of a token (US-174)

## Goal

A token could open any number of event streams, each with its own task, its own serialization of every change and its own copy
of the table's moments. After this story a token has a few streams, a table has a bounded number, and a change is serialized
once per viewer.

## Decisions

- **A book of open streams on the table's handle.** `TableHandle::open_stream(owner)` takes a place and returns a `StreamLease`;
  the stream holds the lease, dropping it frees the place. The book lists the open streams oldest first, each with the hash of
  the token it belongs to and a cancellation token.
- **Per token: `STREAMS_PER_TOKEN = 4`; the oldest is closed.** Four covers a few tabs and a reconnection that overlaps the old
  stream. The fifth stream of a token cancels the token's oldest, which ends (`take_until` on its cancellation), and its
  presence guard drops as it ends. The seat's presence reuses the existing counter: a new stream is counted by `reconnect`
  before the old one's guard drops, so the seat never reads as disconnected. No new code is needed: nothing is refused.
- **Per table: `MAX_STREAMS_PER_TABLE = 100`; a stream over it is refused as busy** (`capacity-exceeded`, 503, the existing
  code). Four seats and twenty spectators at four streams each is 96. The per-token rule is applied first, so a token never
  fills the table by itself.
- **Whose token a stream is.** A stream opened with the player token (header or the deprecated query) belongs to the hash of that
  token. A ticket remembers the hash of the token it was issued to (`stream_ticket` has it), and `authorize_ticket` returns it,
  so the streams opened with tickets count against the token that asked for them, not the single-use ticket.
- **One serialization per viewer and version.** `Published` keeps what the streams were sent, keyed by viewer and by what they
  asked (the plain snapshot, or the numbered events after a cursor), up to 16 entries per version. The first stream that asks
  builds the messages, the others share the `Arc`; a counter (`built`) lets a test count the builds. The reactions of that
  snapshot are those of the first reader's clock: readers of one version differ by milliseconds, and a stream only sends on a
  change. The bytes of the JSON are built once; each stream still copies them into its own SSE frame.
- **The moments are shared.** The recorder kept a `VecDeque` of moments and copied it into every published version. It is now
  one `MomentLog` behind a lock, shared by all the versions and all the streams; a change appends and trims it, nothing is
  copied, and a reader of an older version ignores the moments numbered after its own `latest`.

## Tests (`tests/stream_limits.rs`)

- A token's fifth stream closes its first; the others and the new one stay; the seat counts four open streams and is still the
  player's, and a change reaches the newest.
- The streams of another token of the same table are not closed.
- A table at its maximum refuses the next stream, in the lease API and over HTTP (503), and a freed place is usable.
- A change with four streams open is serialized once (`built` is 1 before and after); ten direct readers of one version and
  cursor share one `Arc`.
- Two versions of a table share one moment log.
- `sse.rs` and `event_stream.rs` pass unchanged.

## Left out

Closing the streams of a token when the token is removed; a limit per client address.
