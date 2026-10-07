-- Accounts now come from Zitadel and are keyed on its user id (US-075). No real accounts existed before, so the
-- development accounts signed in directly with Google or GitHub are removed, with the matches recorded for them.
DELETE FROM match_record
WHERE id IN (SELECT match_id FROM match_seat WHERE account_id IS NOT NULL);

UPDATE match_seat SET account_id = NULL WHERE account_id IS NOT NULL;

DELETE FROM account;
