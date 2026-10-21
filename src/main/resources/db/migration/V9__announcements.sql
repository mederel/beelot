-- Announcements (US-060): whether a match was played with them, and the points they scored in each round. Matches
-- recorded before read as played without announcements.
ALTER TABLE match_record ADD COLUMN announcements BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE match_round ADD COLUMN north_south_announcements INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_round ADD COLUMN east_west_announcements INTEGER NOT NULL DEFAULT 0;
