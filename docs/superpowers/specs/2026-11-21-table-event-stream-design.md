# Table event stream (US-168)

ADR-006 step 5. The design of the table task is in `2026-11-21-table-task-design.md`.

## Goal

A player who comes back after a gap is told the moves they missed, in order, as numbered events, instead of being handed a
new snapshot that hides what happened in between.

## Protocol

`GET /api/tables/{id}/events` keeps its route, its authentication (ticket, header or deprecated token) and the JSON of its
`snapshot`. Two things are new:

- `events=1` in the query asks for the numbered stream. Without it the stream is the old one: one `snapshot` event for each
  change, so a page loaded before the deploy keeps working for one release. The next release removes that branch.
- `lastEventId=n` in the query, or the `Last-Event-ID` header the browser sends when it reconnects by itself, says the last
  event the client has.

A numbered stream sends:

1. On open without a number the table can honour: a `snapshot` whose SSE `id` is the number of the last event recorded.
2. Afterwards, for each change of the table, `event` messages, one per moment, `id` = its sequence number.
3. A number the table no longer holds (older than the kept moments, or from before a restart, so greater than the latest)
   gets a fresh `snapshot` instead.

An `event` is a JSON object with `type`, `seq`, `version` and the fields of the moment. The last event of a batch also has
`state`, the snapshot of the table as the receiving seat sees it. A client that applies the events of any gap therefore ends
with the table a fresh snapshot gives: the test compares the two.

## Moments

The table's task has a `Recorder` that turns each change into moments and keeps the last 400. Moments come from the events
of ADR-006 (`Entry`) plus what the public view says happened beyond them:

| type | fields | from |
| --- | --- | --- |
| `call` | `seat`, `player`, `call` (the label players read), `coinche` | `Called` |
| `card` | `seat`, `player`, `card`, `declare` | `CardPlayed` |
| `deal` | `dealer`, and `hand` (the receiving seat's own cards) | `Dealt` |
| `trick` | `seat`, `winner`, `points` | the trick shown with its winner |
| `round` | `team`, `made`, `capot` | the round scored |
| `match` | `winner` | the match won |
| other events | the event's own fields, without `account`, `seed` or `matchId` | joins, ready, settings, takeovers... |
| `changed` | none | a change that made no event (a version bump) |

Privacy: the body of a moment is public. A bot's hand, a seed or an account never appears. The only private part is the
`hand` of a `deal`, filled in per receiving seat from that seat's own snapshot, and `state`, which is per seat already. A
spectator gets no hand.

## Client

`table-events.js` reads a message: its number, the table when it has one, and what a screen reader says. The stream remembers
the last number and opens again with `lastEventId` after a drop. Online tables are announced (US-074) from the events as they
arrive; solo tables, which use no stream, keep the comparison in `game-events.js`.

## Deviations from the story, on purpose

- `game-events.js` stays for solo tables (they have no stream, and their action responses are snapshots). It leaves the
  online path. Removing it entirely needs solo tables to stream their events too, which is a larger change than this story.
- The bots' expressions and comments (US-088, US-112) and the missed-moves count (US-163) still read the snapshot, which the
  events carry as `state`. Moving them to the events needs `bot-reactions.js` to be fed events rather than boards.
- Moments are not rebuilt from the saved log after a restart: saving events is US-169.

## Tests

- `tests/event_stream.rs`: a new stream's snapshot and first event, the old stream still sends snapshots, a gap of many
  moves arrives in order with `state` only on the last and equals a fresh read, an unknown number gets a snapshot, and no seat
  is sent another's cards, a seed or an account.
- `frontend-tests/table-events.test.cjs`: which events are spoken and how a message is read.
