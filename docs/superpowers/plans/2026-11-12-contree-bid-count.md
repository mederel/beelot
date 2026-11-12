# Plan: count the bid in Contrée and play to 2,000 (US-130)

1. `scoring.rs`: bid fields in `RoundResult`, the bid added to the contract's winner, capot counted once; unit tests for
   made, failed, capot (both sides), coinche, Classic, and old JSON.
2. `match_score.rs`: `default_target(variant)`, `MatchScore::for_variant`; test the default of each variant.
3. Server: `Lobby::open` and the create route use the variant's default; bid fields in `RoundResultView`; contract
   snapshot and board tests updated.
4. Frontend: bid line, setup default by variant, help text, FR and NL texts, tests.
5. Arena: matches to the variant's default target.
6. Backlog note; run the arena for the bots' estimates; PR.
