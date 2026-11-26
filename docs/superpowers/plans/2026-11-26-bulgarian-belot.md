# Plan — US-215 Bulgarian Belot

1. Spec (this change's `specs/2026-11-26-bulgarian-belot-design.md`) and this plan, committed first.
2. `beelot-game`: `Variant::Bulgarian`; ordinal bids in `BiddingState`; default target; scoring checks; bot bidding;
   tests; a recorded deal in `fixtures/`.
3. `beelot-table`, `beelot-arena`, `beelot-server`: match the new variant (messages, seats, routes, DB, statistics,
   leaderboard, daily deal), server language negotiation for `bg`.
4. Frontend: `Language` + `LANGUAGES` + `bg.ts`; variant choice in the setup sheet; bidding sheet for ordinal bids;
   texts through `t()` with fr/nl/bg; extremes e2e for `bg`; `npm run build` to rebuild `static/`.
5. Docs: `pages/docs/` rules page for the variant and the languages page.
6. Run cargo fmt/clippy/test and the frontend checks; fetch `origin/main`, rebase, push, open the PR
   (`feat: ...`, `Closes #508`), enable squash auto-merge, watch the checks.
