-- Accounts of players who signed in with an OAuth provider (US-057). No email or avatar is stored.
-- Times are stored in UTC.
CREATE TABLE account (
    id               UUID         NOT NULL PRIMARY KEY,
    provider         VARCHAR(32)  NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    display_name     VARCHAR(30)  NOT NULL,
    created_at       DATETIME(6)  NOT NULL,
    last_sign_in_at  DATETIME(6)  NOT NULL,
    CONSTRAINT account_provider_subject_unique UNIQUE (provider, provider_subject)
);
