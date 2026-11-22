# Design: close the small gaps in the limits and comparisons (US-181)

## Goal

Three small limits can be passed by luck or by timing: the comparison of secrets leaks the lengths, a table's command queue is
unbounded, and the cap on tables is checked in one step and applied in another. After this story each is exact.

## Decisions

- **`equal()` hashes both values.** `auth::csrf::equal` takes the SHA-256 of each side (already a dependency) and compares the two
  32-byte digests without stopping at the first difference. The time depends on the input lengths only through the hash of the
  longer input, never on where the two differ, and a length difference no longer returns early. Padding was rejected: a
  pad-to-maximum has no maximum for a header.
- **A bounded command queue.** A table's inbox is `mpsc::channel(256)` (`task::COMMAND_QUEUE`) instead of an unbounded one. 256
  is far above what four players and their bots send between two turns of the task. A request sent to a full queue is refused
  with the existing `AppError::CapacityExceeded` (503 `capacity-exceeded`, `Retry-After`), so no new message code or text is
  needed. A closed queue is still "not found".
  The account deletion (`release_account`) is the one request that waits for room instead of being refused: it must reach
  every table, and its caller ignores errors.
  Three commands come from places that cannot report a refusal and must not be lost (`Disconnect` and `Watcher` from stream
  destructors, `Stop`): on a full queue they are sent from a small task of their own that waits for room.
- **One atomic step for the caps.** `TableCounts::reserve(kind, max)` checks and increments in one `try_update`: the local counter
  gates the local cap, and a new `online` counter (private plus public) gates the online cap, so the online cap is exact although
  it spans two kinds. `TableRegistry::reserve` returns a `Place`, a guard handed to `insert`; a creation that fails or panics
  between the reservation and the insertion drops it and gives the place back. The counters now count a table from its reservation
  (they were incremented at insertion), `Removal` still uncounts it, and restored tables are counted without a cap as before.
  `ensure_capacity` is gone.

## Tests

- `equal`: equal, different, and different-length inputs (in both directions, and empty). The timing itself is not asserted: a
  wall-clock test of constant time is flaky, so the test covers the result and the code review covers the shape.
- Parallel creations at the limit (multi-threaded runtime, 200 attempts against caps of 10 local and 7 online): exactly the caps
  are taken and the counters equal a scan. Before the change, the check and the insertion were two steps and this test could
  exceed the caps.
- A full command queue: asks are queued without the task running until the queue is full; the next one is refused with
  `CapacityExceeded`; once the task runs, the table answers again.
- The existing tests on the caps, the counters (US-183) and removal by panic pass unchanged.

## Left out

The passkey ceremonies and the events limiter keep their own bounds; sweeping them is not part of this change.
