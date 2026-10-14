-- The sign-in before the latest one, shown to the player (US-077); empty until the second sign-in.
ALTER TABLE account ADD COLUMN previous_sign_in_at DATETIME(6);
