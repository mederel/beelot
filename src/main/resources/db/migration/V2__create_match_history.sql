-- Finished matches with at least one signed-in player (US-058). Teams are NORTH_SOUTH or EAST_WEST.
CREATE TABLE match_record (
    id                UUID PRIMARY KEY,
    ended_at          TIMESTAMP WITH TIME ZONE NOT NULL,
    mode              VARCHAR(16) NOT NULL,
    variant           VARCHAR(16) NOT NULL,
    difficulty        VARCHAR(16),
    north_south_score INTEGER     NOT NULL,
    east_west_score   INTEGER     NOT NULL,
    winning_team      VARCHAR(16) NOT NULL
);

-- The four seats in play order (position 0 is North); account_id is null for guests and bots.
CREATE TABLE match_seat (
    match_id   UUID        NOT NULL REFERENCES match_record (id) ON DELETE CASCADE,
    position   INTEGER     NOT NULL,
    account_id UUID REFERENCES account (id),
    name       VARCHAR(30) NOT NULL,
    team       VARCHAR(16) NOT NULL,
    bot        BOOLEAN     NOT NULL,
    PRIMARY KEY (match_id, position)
);

CREATE INDEX match_seat_account_idx ON match_seat (account_id);

-- Each round in the order played; contract_value is null in classic Belote.
CREATE TABLE match_round (
    match_id           UUID        NOT NULL REFERENCES match_record (id) ON DELETE CASCADE,
    round_index        INTEGER     NOT NULL,
    declaring_team     VARCHAR(16) NOT NULL,
    trump              VARCHAR(16) NOT NULL,
    contract_value     INTEGER,
    coinched           BOOLEAN     NOT NULL,
    contract_made      BOOLEAN     NOT NULL,
    capot_team         VARCHAR(16),
    belote_team        VARCHAR(16),
    north_south_points INTEGER     NOT NULL,
    east_west_points   INTEGER     NOT NULL,
    PRIMARY KEY (match_id, round_index)
);
