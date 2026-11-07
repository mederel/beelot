-- Friends and table invitations (US-070).

-- The personal link a player shares to be added as a friend; created the first time it is asked for.
CREATE TABLE friend_code (
    account_id UUID        NOT NULL PRIMARY KEY,
    code       VARCHAR(32) NOT NULL,
    CONSTRAINT friend_code_unique UNIQUE (code),
    CONSTRAINT friend_code_account_fk FOREIGN KEY (account_id) REFERENCES account (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- The requester opened the addressee's link; the friendship counts once the addressee accepted.
CREATE TABLE friendship (
    requester  UUID        NOT NULL,
    addressee  UUID        NOT NULL,
    accepted   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (requester, addressee),
    INDEX friendship_addressee_idx (addressee),
    CONSTRAINT friendship_requester_fk FOREIGN KEY (requester) REFERENCES account (id) ON DELETE CASCADE,
    CONSTRAINT friendship_addressee_fk FOREIGN KEY (addressee) REFERENCES account (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- A table owner's invitation to a friend; it lapses after ten minutes.
CREATE TABLE table_invite (
    id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    from_account UUID        NOT NULL,
    to_account   UUID        NOT NULL,
    table_id     UUID        NOT NULL,
    code         VARCHAR(16) NOT NULL,
    created_at   DATETIME(6) NOT NULL,
    INDEX table_invite_to_idx (to_account, created_at),
    CONSTRAINT table_invite_from_fk FOREIGN KEY (from_account) REFERENCES account (id) ON DELETE CASCADE,
    CONSTRAINT table_invite_to_fk FOREIGN KEY (to_account) REFERENCES account (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
