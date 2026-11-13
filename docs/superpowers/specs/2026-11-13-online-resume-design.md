# Resume an online match (US-145)

## Design

- A second device-local record, `beelot.resume-online`: a list of `{tableId, playerToken}`, newest first, at most three, one
  per table. The solo record of US-122 is untouched.
- Written by `loadOnlineTable` when the viewer holds a seat (`snapshot.you` is set) and the match is not over; removed when
  it is over or the viewer is only watching. `tableSession` falls back to this list, so a new tab or a restart reaches the
  table with the seat's own token, and the existing bot takeover hands the seat back as it does today.
- Home lists one card per record under the solo card. The pure `onlineResumeCard(snapshot)` builds it (path, variant,
  score of the viewer's team, or "waiting for players" in a lobby). A record whose table answers with an error status
  (closed, unknown, token refused) is dropped; a network failure keeps it. Each card has a forget button.
- The only requests are the tables' own `GET /api/tables/{id}`.

## Not verified

No browser check of the cards or the forget button; the logic is tested as pure functions and as source wiring.
