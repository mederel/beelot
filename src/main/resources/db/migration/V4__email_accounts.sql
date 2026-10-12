-- Email-link accounts (US-075, ADR-004): the address lives only here, and is used only to send sign-in links.
CREATE TABLE account_email (
    account_id UUID         NOT NULL PRIMARY KEY REFERENCES account (id) ON DELETE CASCADE,
    email      VARCHAR(254) NOT NULL,
    CONSTRAINT account_email_unique UNIQUE (email)
);

-- Pending sign-in links; only the SHA-256 hash of each token is stored. Times are in UTC.
CREATE TABLE sign_in_token (
    token_hash CHAR(64)     NOT NULL PRIMARY KEY,
    email      VARCHAR(254) NOT NULL,
    expires_at DATETIME(6)  NOT NULL
);

CREATE INDEX sign_in_token_expires_idx ON sign_in_token (expires_at);

-- Zitadel accounts existed only in development databases; they go with Zitadel, like the matches recorded for them.
DELETE FROM match_record
WHERE id IN (SELECT s.match_id FROM match_seat s JOIN account a ON a.id = s.account_id WHERE a.provider = 'zitadel');
UPDATE match_seat SET account_id = NULL
WHERE account_id IN (SELECT id FROM account WHERE provider = 'zitadel');
DELETE FROM account WHERE provider = 'zitadel';
