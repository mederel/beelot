-- Tout-atout and sans-atout (US-063): whether the match's bidding allowed them. Matches recorded before read as played without.
ALTER TABLE match_record ADD COLUMN all_trumps BOOLEAN NOT NULL DEFAULT FALSE;
