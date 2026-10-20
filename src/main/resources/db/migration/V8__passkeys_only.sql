-- Passkeys only (US-084): a clean break. Email, Google and GitHub sign-in go, and so does every account made with
-- them; db-update-v2-to-v7.sql must have brought production to version 7 first. Finished matches stay in the other
-- players' history, with the deleted accounts' seats renamed "Deleted player" (FinishedMatch.DELETED_PLAYER).
UPDATE match_seat SET account_id = NULL, name = 'Deleted player' WHERE account_id IS NOT NULL;

DELETE FROM security_event WHERE account_id IS NOT NULL;
DELETE FROM security_event WHERE type IN ('LINK_REQUESTED', 'EMAIL_CHANGE_REQUESTED', 'EMAIL_CHANGED');

DROP TABLE email_change_token;
DROP TABLE sign_in_token;
DROP TABLE account_email;

DELETE FROM account;
ALTER TABLE account DROP INDEX account_provider_subject_unique;
ALTER TABLE account DROP COLUMN provider;
ALTER TABLE account DROP COLUMN provider_subject;
ALTER TABLE account DROP COLUMN deletion_warned_at;

-- Spring Security's passkey tables (user-entities and user-credentials schemas of spring-security-web), in MariaDB
-- types sized for InnoDB keys. A player has one passkey, so a user has one credential.
CREATE TABLE user_entities (
    id           VARCHAR(100) CHARACTER SET ascii NOT NULL PRIMARY KEY,  -- user handle, base64url
    name         VARCHAR(100) NOT NULL,                                  -- the account id
    display_name VARCHAR(200),
    created_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),     -- Beelot's: purges abandoned sign-ups
    CONSTRAINT user_entities_name_unique UNIQUE (name)
);

CREATE TABLE user_credentials (
    credential_id                VARCHAR(1400) CHARACTER SET ascii NOT NULL PRIMARY KEY,
    user_entity_user_id          VARCHAR(100) CHARACTER SET ascii NOT NULL,
    public_key                   BLOB NOT NULL,
    signature_count              BIGINT,
    uv_initialized               BOOLEAN,
    backup_eligible              BOOLEAN NOT NULL,
    authenticator_transports     VARCHAR(1000),
    public_key_credential_type   VARCHAR(100),
    backup_state                 BOOLEAN NOT NULL,
    attestation_object           MEDIUMBLOB,
    attestation_client_data_json BLOB,
    created                      DATETIME(6),
    last_used                    DATETIME(6),
    label                        VARCHAR(1000) NOT NULL,
    CONSTRAINT user_credentials_one_per_user UNIQUE (user_entity_user_id),
    CONSTRAINT user_credentials_user_fk FOREIGN KEY (user_entity_user_id) REFERENCES user_entities (id) ON DELETE CASCADE
);
