# Offer an account when it is worth it (US-115) — implementation plan

Spec: `docs/superpowers/specs/2026-11-06-account-offer-design.md`.

### Task 1: Offer logic (`static/account-offer.js`, `frontend-tests/account-offer.test.cjs`)
- `countMatch(state, signature)` (once per signature), `shouldOffer(state, signedIn)`, `dismissOffer(state)`,
  `loadOffer`/`saveOffer` (blocked or corrupt storage never throws), cooldown of 3 matches.

### Task 2: Markup and texts
- `index.html`: `#match-end-offer` card, `account-offer.js` before `match-end.js`; French and Dutch texts; styles.

### Task 3: Wiring
- `match-end.js`: show the card when `model.offer`, with `onCreateAccount` and `onDismissOffer`.
- `app.js`: in `celebrateMatchEnd` (live, guest) count the match and set `model.offer`; "Not now" saves the
  dismissal; "Create an account" closes the screen, goes home and opens the sign-up warning.

### Task 4: Check and ship
- `cargo fmt --check`, frontend tests, scripted browser check at 390 × 844, PR with auto-merge (squash).
