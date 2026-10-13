-- Security events (US-083): never a token. account_id has no foreign key, so
-- the history never blocks a deletion; an account's events go with it.
CREATE TABLE security_event (
    id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    account_id  UUID,
    type        VARCHAR(32) NOT NULL,
    outcome     VARCHAR(16) NOT NULL,
    ip_address  VARCHAR(45),
    occurred_at DATETIME(6) NOT NULL
);
CREATE INDEX security_event_account_idx ON security_event (account_id, occurred_at);
CREATE INDEX security_event_occurred_idx ON security_event (occurred_at);

-- When the inactivity warning was sent (US-083); a sign-in clears it.
ALTER TABLE account ADD COLUMN deletion_warned_at DATETIME(6);
