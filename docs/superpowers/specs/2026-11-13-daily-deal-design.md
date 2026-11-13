# A daily deal (US-150)

## Design (server part)

- `deal_seed(secret, day)` is an HMAC-SHA-256 of the UTC date keyed by `BEELOT_DAILY_DEAL_SECRET`; without the secret there
  is no daily deal (the routes answer 404). `variant_of(day)` alternates Belote and Contrée with the day.
- `Table::daily` is a solo table against the Challenging bots, dealt from the seed with a first dealer drawn from it, so
  the cards and the dealer are the same for everyone. It plays one round: `NextRound` is refused.
- A signed-in player claims the day's attempt (`daily_attempt`, primary key day + account) when starting; a second start is
  refused with `daily-played`, even if the first was left unfinished. When the round ends the table hands over a
  `DailyResult` (the points of North-South, the human's team) and `AppState::hand_over` stores it once. A guest may play
  it, unranked and unrecorded.
- `GET /api/daily?day=today|yesterday` returns the day's variant, the ten best scores (equal scores share a rank, players
  hidden from the leaderboards are left out) and the player's own score and rank. Nothing beyond the account, the day and
  the score is kept; the account's attempts are deleted with the account.
- The deal's cards are never sent before the table is played: only the table's own snapshot shows the viewer's hand.

## Delivered in a second PR

The home card that starts the daily deal and the board in the leaderboard view.

## Not verified

The Rust and the SQL were written without a toolchain or a database; CI is the first run.
