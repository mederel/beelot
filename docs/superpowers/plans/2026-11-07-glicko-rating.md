# Plan: Glicko-2 rating (US-068)

1. `rating.rs`: pure Glicko-2 with unit tests (compiled and run standalone).
2. Migration, `db/ratings.rs`, `history/rated.rs`; call it from the recorder inside the match transaction.
3. `GET /api/ratings`.
4. `rating-view.js` and the Rating panel; FR and NL texts; tests.
5. Backlog notes; PR.
