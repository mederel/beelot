-- Accounts of players who signed in with an OAuth provider (US-057). No email or avatar is stored.
CREATE TABLE account (
    id               UUID PRIMARY KEY,
    provider         VARCHAR(32)  NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    display_name     VARCHAR(30)  NOT NULL,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    last_sign_in_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT account_provider_subject_unique UNIQUE (provider, provider_subject)
);
