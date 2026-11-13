-- The daily deal (US-150): one attempt per account and day, claimed when the player starts, scored when the round ends.
CREATE TABLE daily_attempt (
    day        DATE    NOT NULL,
    account_id UUID    NOT NULL,
    score      INT     NULL,
    PRIMARY KEY (day, account_id),
    INDEX daily_attempt_score_idx (day, score),
    CONSTRAINT daily_attempt_account_fk FOREIGN KEY (account_id) REFERENCES account (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
