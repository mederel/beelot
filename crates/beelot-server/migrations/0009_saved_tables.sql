-- Tables kept through a restart (US-169): a table is its origin and its events (ADR-006), saved as the table changes,
-- with the hashes of the tokens that act at it. A table is deleted with its last activity two hours old.
CREATE TABLE saved_table (
    table_id      UUID         NOT NULL PRIMARY KEY,
    format        SMALLINT     NOT NULL,
    origin        LONGTEXT     NOT NULL,
    last_activity DATETIME(6)  NOT NULL,
    INDEX saved_table_activity_idx (last_activity)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE table_event (
    table_id UUID        NOT NULL,
    seq      INT         NOT NULL,
    version  BIGINT      NOT NULL,
    at       DATETIME(6) NOT NULL,
    event    LONGTEXT    NOT NULL,
    PRIMARY KEY (table_id, seq),
    CONSTRAINT table_event_table_fk FOREIGN KEY (table_id) REFERENCES saved_table (table_id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- The SHA-256 of a token in hex, never the token. `actor` is `seat:<n>`, `device` or `spectator`.
CREATE TABLE table_token (
    table_id   UUID        NOT NULL,
    token_hash CHAR(64)    NOT NULL,
    actor      VARCHAR(16) NOT NULL,
    PRIMARY KEY (table_id, token_hash),
    CONSTRAINT table_token_table_fk FOREIGN KEY (table_id) REFERENCES saved_table (table_id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- The events name a seat's account by `link`, a number made for this table; this is the only place that says whose it is.
-- Deleting an account deletes its links, and the table restored afterwards has that seat with no account.
CREATE TABLE table_seat_link (
    table_id   UUID NOT NULL,
    link       UUID NOT NULL,
    account_id UUID NOT NULL,
    PRIMARY KEY (table_id, link),
    INDEX table_seat_link_account_idx (account_id),
    CONSTRAINT table_seat_link_table_fk FOREIGN KEY (table_id) REFERENCES saved_table (table_id) ON DELETE CASCADE,
    CONSTRAINT table_seat_link_account_fk FOREIGN KEY (account_id) REFERENCES account (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
