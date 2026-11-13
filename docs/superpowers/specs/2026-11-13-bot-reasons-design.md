# Why did the bot play that? (US-149)

## Design

- `play_reasons` (beelot-game, `bot/review.rs`) rebuilds, for each card a bot played in a finished round, that seat's own
  `PlayView`: the cards it still had to play (its hand), the tricks already played and the cards on the table. It never
  reads another seat's cards. The reason is the hint engine's `card_reason`; a card whose only reason is the general "best
  for the round" is left out, so nothing is guessed.
- `GET /api/tables/{id}/explanations` (solo, one human, round finished) returns `[{trick, position, seat, reason}]` with the
  reason codes the hints already use. It is cheap, unlike the analysis, so it is answered at once.
- The round review shows a "Why?" button under each bot card of the trick shown; it opens the reason in the player's
  language (the texts of the hints, already in French and Dutch). Open reasons are kept while stepping.

## Scope

Card plays only. The bots' calls in the auction are not explained: rebuilding an auction view of the past needs the auction
state at each call, which the finished round does not keep. This is left for a follow-up.

## Not verified

The Rust (game crate, table, route and their tests) is first compiled by CI; the exact reason of the fixed test deal
(`a_master_card_led_is_explained`) is an expectation, not a measured result. No browser check of the button.
