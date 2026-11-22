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
    crate::traces::db("insert", async move {
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

/// The serialized passkey of the account with that credential id.
pub async fn find<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
    credential_id: &[u8],
) -> sqlx::Result<Option<String>> {
    crate::traces::db("find", async move {
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
    crate::traces::db("update", async move {
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
    crate::traces::db("dates", async move {
        let dates: Option<(PrimitiveDateTime, Option<PrimitiveDateTime>)> =
            sqlx::query_as("SELECT created_at, last_used_at FROM passkey WHERE account_id = ?")
                .bind(id(account))
                .fetch_optional(db)
                .await?;
        Ok(dates.map(|(created, used)| (from_utc(created), used.map(from_utc))))
    })
    .await
}
