# Small goals and streaks (US-113)

## Decisions

- One friendly goal line on the home page and on the match-end screen (US-093), chosen by priority:
  first game awaits, `{n}` wins in a row (n ≥ 2), an encouraging note when a streak of 2 or more has just
  ended, first win in sight, `{n}` games today (n ≥ 2), then a nudge to start a streak. A loss is never
  called a failure.
- Guests: a ledger in `localStorage` (`beelot.goals`, last 20 results, signatures of counted games so a
  reload of a finished match counts once). Signed-in players: no new server storage. The goals are derived
  from `GET /api/statistics` (totals and the 20 most recent matches, which the server already records for
  solo, private and public matches). The streak is therefore capped at 20.
- The first finished game and the first win are celebrated on the match-end screen with the US-090 sticker
  and confetti (`First game!`, `First win!`), only when the match ends live, never when coming back to a
  finished match. For a signed-in player the result is previewed locally and the statistics are fetched
  again 1.5 s later.
- If the statistics cannot be fetched, no goal is shown or celebrated.
- Texts are in `i18n.js` (French) and `i18n-nl.js` (Dutch); native-speaker review pending.

Code: `static/goals.js` (pure logic, `frontend-tests/goals.test.cjs`), wiring in `static/app.js`
(`loadGoals`, `goalOutcome`) and `static/match-end.js`.
