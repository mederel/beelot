-- The match target (US-062): the points that win each match. Matches recorded before read as played to 1,000.
ALTER TABLE match_record ADD COLUMN target INTEGER NOT NULL DEFAULT 1000;
