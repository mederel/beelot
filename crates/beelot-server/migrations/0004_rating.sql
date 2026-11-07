-- Glicko-2 ratings from public matches (US-068): one row per account and variant, and the history of its changes.
CREATE TABLE rating (
    account_id UUID        NOT NULL,
    variant    VARCHAR(16) NOT NULL,
    rating     DOUBLE      NOT NULL,
    deviation  DOUBLE      NOT NULL,
    volatility DOUBLE      NOT NULL,
    matches    INTEGER     NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (account_id, variant),
    CONSTRAINT rating_account_fk FOREIGN KEY (account_id) REFERENCES account (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE rating_history (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    account_id UUID        NOT NULL,
    variant    VARCHAR(16) NOT NULL,
    match_id   UUID        NOT NULL,
    rating     DOUBLE      NOT NULL,
    deviation  DOUBLE      NOT NULL,
    rated_at   DATETIME(6) NOT NULL,
    INDEX rating_history_account_idx (account_id, variant, rated_at),
    CONSTRAINT rating_history_account_fk FOREIGN KEY (account_id) REFERENCES account (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
