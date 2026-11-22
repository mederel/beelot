//! The `passkey` table: each account's one passkey, as webauthn-rs serializes it.

use sqlx::{Executor, MySql};
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::{from_utc, id, utc};

pub async fn insert<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
    credential_id: &[u8],
    passkey: &str,
    now: OffsetDateTime,
) -> sqlx::Result<()> {
    crate::traces::db("passkeys.insert", async move {
        sqlx::query(
        "INSERT INTO passkey (account_id, credential_id, passkey, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id(account))
    .bind(credential_id)
    .bind(passkey)
    .bind(utc(now))
    .execute(db)
    .await?;
        Ok(())
    })
    .await
}

/// The unique key of the migration on the credential id.
const CREDENTIAL_KEY: &str = "passkey_credential_unique";

/// Whether an insert failed because another account already holds the credential id, and for no other reason: a unique
/// violation that names the credential's key (the driver gives no constraint name, so the message is read).
pub fn credential_taken(error: &sqlx::Error) -> bool {
    error.as_database_error().is_some_and(|error| {
        error.is_unique_violation() && error.message().contains(CREDENTIAL_KEY)
    })
}

/// The serialized passkey of the account with that credential id.
pub async fn find<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
    credential_id: &[u8],
) -> sqlx::Result<Option<String>> {
    crate::traces::db("passkeys.find", async move {
        // MariaDB's JSON is a binary-collated LONGTEXT.
        let stored: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT passkey FROM passkey WHERE account_id = ? AND credential_id = ?",
        )
        .bind(id(account))
        .bind(credential_id)
        .fetch_optional(db)
        .await?;
        Ok(stored.and_then(|bytes| String::from_utf8(bytes).ok()))
    })
    .await
}

/// Stores the passkey after a sign-in, with its new counter, and when it was used.
pub async fn update<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
    passkey: &str,
    now: OffsetDateTime,
) -> sqlx::Result<()> {
    crate::traces::db("passkeys.update", async move {
        sqlx::query("UPDATE passkey SET passkey = ?, last_used_at = ? WHERE account_id = ?")
            .bind(passkey)
            .bind(utc(now))
            .bind(id(account))
            .execute(db)
            .await?;
        Ok(())
    })
    .await
}

/// When the account's passkey was registered and last used, if it has one.
pub async fn dates<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
) -> sqlx::Result<Option<(OffsetDateTime, Option<OffsetDateTime>)>> {
    crate::traces::db("passkeys.dates", async move {
        let dates: Option<(PrimitiveDateTime, Option<PrimitiveDateTime>)> =
            sqlx::query_as("SELECT created_at, last_used_at FROM passkey WHERE account_id = ?")
                .bind(id(account))
                .fetch_optional(db)
                .await?;
        Ok(dates.map(|(created, used)| (from_utc(created), used.map(from_utc))))
    })
    .await
}

#[cfg(test)]
mod tests {
    //! Tests of `credential_taken` with errors made up as the driver would report them.

    use std::borrow::Cow;
    use std::fmt;

    use sqlx::error::{DatabaseError, ErrorKind};

    use super::*;

    #[derive(Debug)]
    struct Failure(&'static str, ErrorKind);

    impl fmt::Display for Failure {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str(self.0)
        }
    }

    impl std::error::Error for Failure {}

    impl DatabaseError for Failure {
        fn message(&self) -> &str {
            self.0
        }
        fn code(&self) -> Option<Cow<'_, str>> {
            None
        }
        fn as_error(&self) -> &(dyn std::error::Error + Send + Sync + 'static) {
            self
        }
        fn as_error_mut(&mut self) -> &mut (dyn std::error::Error + Send + Sync + 'static) {
            self
        }
        fn into_error(self: Box<Self>) -> Box<dyn std::error::Error + Send + Sync + 'static> {
            self
        }
        fn kind(&self) -> ErrorKind {
            match self.1 {
                ErrorKind::UniqueViolation => ErrorKind::UniqueViolation,
                _ => ErrorKind::Other,
            }
        }
    }

    fn database(message: &'static str, kind: ErrorKind) -> sqlx::Error {
        sqlx::Error::Database(Box::new(Failure(message, kind)))
    }

    #[test]
    fn a_duplicate_credential_id_is_a_taken_credential() {
        let error = database(
            "Duplicate entry '0x0102' for key 'passkey_credential_unique'",
            ErrorKind::UniqueViolation,
        );
        assert!(credential_taken(&error));
    }

    #[test]
    fn another_unique_key_is_not() {
        let error = database(
            "Duplicate entry 'x' for key 'PRIMARY'",
            ErrorKind::UniqueViolation,
        );
        assert!(!credential_taken(&error));
    }

    #[test]
    fn other_database_errors_are_not() {
        let error = database("Table 'beelot.passkey' doesn't exist", ErrorKind::Other);
        assert!(!credential_taken(&error));
        // The key's name in another kind of error is still not a duplicate.
        let error = database("passkey_credential_unique is broken", ErrorKind::Other);
        assert!(!credential_taken(&error));
    }

    #[test]
    fn an_error_that_is_not_the_database_s_is_not() {
        assert!(!credential_taken(&sqlx::Error::PoolTimedOut));
    }
}
