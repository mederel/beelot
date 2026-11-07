-- A player may hide themselves from the leaderboard (US-069).
ALTER TABLE account ADD COLUMN leaderboard_hidden BOOLEAN NOT NULL DEFAULT FALSE;
