# Count the bid in Contrée and play to 2,000 by default (US-130)

- Scoring (`beelot-game::scoring::score`): in Contrée the bid is added once, when the round is totalled, to the team
  that wins the contract: the bidding team when its total reaches the bid, the other team when it fails. It is added to
  what the team already gets (card points, dix de der, Belote, announcements, the 162 of a failed contract, the 250 of
  a capot). Whether the contract is made is still decided before the bid is added, so the bid never helps make itself.
  A coinche or surcoinche doubles the sum, the bid included, as it doubles the other points.
- Capot: the bid used to be inside the taker's capot score. It is now the same generic step, so the capot team gets it
  once: the taker on a capot of its own, the defence on a capot against the taker.
- `RoundResult` gets `northSouthBid` and `eastWestBid` (the bid before doubling, 0 for the team without it and in
  Classic). Both default to 0 when read, so rounds recorded before this change keep their scores and show no bid line.
  Recorded `northSouthAwarded` / `eastWestAwarded` are never recomputed.
- Target: `match_score::default_target(variant)` is 1,000 for Classic and 2,000 for Contrée; the choices stay 500, 1,000,
  1,500 and 2,000 (US-062). `Lobby::open` uses it, so private and public (matchmaking) Contrée tables play to 2,000. The
  create route uses it when a local game names no target. Matches already stored keep their own target.
- API: `roundResult` in the table snapshot carries the two bid fields.
- Frontend: the round breakdown (solo, pass-and-play and private tables) adds a line "Bid: {0} points go to {1}." after
  the announcements; the setup sheet moves its target to 2,000 when the variant becomes Contrée, and back to 1,000,
  while the target is still the previous variant's default; the scoring help text is updated. FR and NL texts.
- Arena: matches are played to the default target of the variant. The deal score already uses the awarded points, so
  the point difference per deal now includes the bid.
- Not verified here: the Rust crates were not compiled (no rustup toolchain and no crates.io in this environment); CI is
  the first full check. The bots' bidding and coinche estimates were not re-measured: run the arena on the new counting
  (`contree-off` and `contree-on`, a baseline of the previous bot, in point difference per deal) before relying on them,
  and open a follow-up if an estimate needs retuning.
