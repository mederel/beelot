# The live table says when it is reconnecting (US-142)

## Design

- The table's event stream already reconnects (the browser, and `openTableStream` after 10 s or when closed). What was
  missing was any sign of it. On the first `error` of a drop, a timer of 3 s starts; if the stream has not opened by then,
  `showConnectionTrouble(true)` shows the note of US-141. Further errors do not restart the timer.
- `streamDropped` records that the note was raised by the stream. `apiJson` no longer hides the note on a successful answer
  while it is set, so a working request cannot say "all well" while the stream is down.
- The `open` event clears the timer and the note and, when the stream had been down, calls `resyncAfterReconnect()`
  (US-141) to read the table at once.
- Reopening the stream (`reopen`) closes the old one with `keepNote`, so the note does not flicker; leaving the table or
  a refusal by the server removes it.

## Not verified here

No browser or network failure was used; the tests check the wiring and the transitions in the source.
