# Leaderboard (US-069)

Builds on the Glicko-2 ratings of US-068 (stacked on that branch).

- `GET /api/leaderboard?variant=CLASSIC|CONTREE` (public): up to 50 rows `{rank, name, rating, matches}`, best rating
  first. Only players with at least ten rated matches and not hidden are listed; equal ratings share a rank. For a
  signed-in player with a rating in the variant, `mine` carries rating, matches, hidden and the rank (the number of
  listed players with a higher rating, plus one) when they are listed, so the rank shows even beyond the top 50.
- `GET` and `PUT /api/leaderboard/visibility`: the `account.leaderboard_hidden` flag (migration 0005, default shown).
  A hidden player is not listed and has no rank, and is told so.
- Display names come from the account, so a later name change (US-072) shows up here by itself.
- Frontend: `/leaderboard` view under the Progress tab with a variant switch, the viewer's note (`leaderboard-view.js`,
  tested), the table with the viewer's row marked, links from Settings; a switch in Settings for signed-in players.
  FR and NL texts.
- Not verified here: the server crate was not compiled (no crates.io), CI is the first full check.
