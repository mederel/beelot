-- Pending email address changes (US-079); only the SHA-256 hash of each token is stored. Times are in UTC.
CREATE TABLE email_change_token (
    token_hash CHAR(64)     NOT NULL PRIMARY KEY,
    account_id UUID         NOT NULL REFERENCES account (id) ON DELETE CASCADE,
    new_email  VARCHAR(254) NOT NULL,
    expires_at DATETIME(6)  NOT NULL
);
CREATE INDEX email_change_token_account_idx ON email_change_token (account_id);
CREATE INDEX email_change_token_expires_idx ON email_change_token (expires_at);
