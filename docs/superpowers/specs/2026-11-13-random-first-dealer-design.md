# A random first dealer (US-139)

## Goal

The human no longer speaks first at the start of every match.

## Design

- `TableSetup` gains an optional draw for the first dealer. `Table::begin_match` takes `next_int(4)` from it, instead
  of the constant `FIRST_DEALER` (the seat before North). Production tables (`TableSetup::default`, used by the registry for
  solo, pass-and-play, private and public tables) draw from the operating system's generator.
- `TableSetup::seeded(seed)` has no draw and keeps `FIRST_DEALER`, so every existing test that replays seeded deals
  keeps its expectations. `with_seeded_first_dealer(seed)` gives a draw that follows the seed (one generator per match,
  separate from the deal generators, so enabling it does not change the decks).
- Only the first deal of a match is drawn. `deal_next_round` still takes the dealer after the previous one, a rematch
  continues the rotation, and a redeal keeps today's rotation. The bot arena and the benchmark build their own deals and
  are untouched, so their reported results do not move.
- The bots before the human's turn already bid inside `drive_bots` and the frontend already shows calls made before the
  player's first call (they happen on later rounds today), so no frontend change is made.

## Tests

`table_flow.rs`: the first dealer follows the seed and covers the four seats; an unseeded-draw table keeps dealer 3; a
match opened by a bot is at the human's turn (or already contracted); the rotation after the first deal is unchanged.

## Not verified here

Nothing was compiled or run here (no Rust toolchain download is possible); CI is the check. The frontend's handling of a
bot opening the very first deal of a match was not looked at in a browser.
