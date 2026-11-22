# Plan: limit the event streams of a token (US-174)

One pull request, `perf:` (nothing a normal client sees changes).

1. **Spec and plan** (this file and the design).
2. **Tests first**: `tests/stream_limits.rs`.
3. **The book**: `open_stream`, `StreamLease`, the two constants, tickets that remember their token's hash.
4. **The route**: take a lease before the stream starts, end the stream on its cancellation.
5. **Serialize once**: `Published::sent`, `stream::messages` and `snapshot_messages` through it.
6. **Share the moments**: `MomentLog` instead of a copied `VecDeque`.
7. **Backlog** "Delivered" note.
8. **Checks**: fmt, clippy, workspace tests (`sse.rs` and `event_stream.rs` unchanged).
