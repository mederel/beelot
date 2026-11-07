# Glicko-2 rating for public matches (US-068)

Decision: Glicko-2 rather than Elo by team average. New and returning players settle quickly, and the deviation tells
the player how firm the number is.

## Rules

- A match is rated when it is public, finished, and all four seats are human (`history::rated::is_rated`). Solo, private
  and bot-filled matches never are; an abandoned match is never recorded, so it cannot be.
- One rating per account and variant (Classic, Contrée), starting at 1500, deviation 350, volatility 0.06, tau 0.5.
- Each match is one rating period per player. A player is rated against the opposing team: mean of the two ratings, the
  deviation being the root mean square of the two. Win scores 1, loss 0. Guests and deleted accounts count as new players
  for the others' calculation and keep nothing.
- Time between matches is not modelled: the deviation only shrinks with play (a known simplification).
- The rating is updated in the same transaction that stores the match, which is skipped when the match is already
  stored, so a match is never rated twice.

## Storage and API

- Migration `0004_rating.sql`: `rating` (current value, matches) and `rating_history` (one row per rated match). Both
  cascade when the account is deleted.
- `GET /api/ratings` (signed in): per variant `{rating, deviation, matches, history:[{ratedAt, rating}]}`, rounded.

## Frontend

`rating-view.js` (pure, tested): rows with a provisional flag (deviation above 110) and the sparkline points. The
statistics page shows a Rating panel with the rating, its uncertainty, the number of matches and a history line per
variant; FR and NL texts.

## Not covered

The privacy export does not list ratings yet (format `beelot-export-2`); the leaderboard is US-069.
