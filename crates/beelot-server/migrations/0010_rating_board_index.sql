-- The leaderboard (US-182): `top` and `listed_above` filter one variant by rating and by the matches that make a player listed.
CREATE INDEX rating_board_idx ON rating (variant, rating, matches);
