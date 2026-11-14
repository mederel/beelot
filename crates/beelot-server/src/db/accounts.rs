//! The `account` table.

use sqlx::{Executor, FromRow, MySql};
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::{DbUuid, from_utc, id, utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub id: Uuid,
    pub display_name: String,
    pub created_at: OffsetDateTime,
    pub last_sign_in_at: OffsetDateTime,
}

impl Account {
    /// A new account, signed in now.
    pub fn new(id: Uuid, display_name: String, now: OffsetDateTime) -> Self {
        Self {
            id,
            display_name,
            created_at: now,
            last_sign_in_at: now,
        }
    }
}

#[derive(FromRow)]
struct Row {
    id: DbUuid,
    display_name: String,
    created_at: PrimitiveDateTime,
    last_sign_in_at: PrimitiveDateTime,
}

impl From<Row> for Account {
    fn from(row: Row) -> Self {
        Self {
            id: row.id.0,
            display_name: row.display_name,
            created_at: from_utc(row.created_at),
            last_sign_in_at: from_utc(row.last_sign_in_at),
        }
    }
}

pub async fn insert<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: &Account,
) -> sqlx::Result<()> {
    crate::traces::db("insert", async move {
        sqlx::query(
        "INSERT INTO account (id, display_name, created_at, last_sign_in_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id(account.id))
    .bind(&account.display_name)
    .bind(utc(account.created_at))
    .bind(utc(account.last_sign_in_at))
    .execute(db)
    .await?;
        Ok(())
    })
    .await
}

pub async fn find<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
) -> sqlx::Result<Option<Account>> {
    crate::traces::db("find", async move {
        let row: Option<Row> = sqlx::query_as(
            "SELECT id, display_name, created_at, last_sign_in_at FROM account WHERE id = ?",
        )
        .bind(id(account))
        .fetch_optional(db)
        .await?;
        Ok(row.map(Account::from))
    })
    .await
}

/// A sign-in now: the one sign-in date kept is the latest.
pub async fn record_sign_in<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
    now: OffsetDateTime,
) -> sqlx::Result<()> {
    crate::traces::db("record_sign_in", async move {
        sqlx::query("UPDATE account SET last_sign_in_at = ? WHERE id = ?")
            .bind(utc(now))
            .bind(id(account))
            .execute(db)
            .await?;
        Ok(())
    })
    .await
}

/// The name other players see for the account.
pub async fn rename<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
    display_name: &str,
) -> sqlx::Result<bool> {
    crate::traces::db("rename", async move {
        let renamed = sqlx::query("UPDATE account SET display_name = ? WHERE id = ?")
            .bind(display_name)
            .bind(id(account))
            .execute(db)
            .await?;
        Ok(renamed.rows_affected() > 0)
    })
    .await
}

/// Deletes the account; its passkey and sessions go with it, and its match seats lose it.
pub async fn delete<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
) -> sqlx::Result<bool> {
    crate::traces::db("delete", async move {
        let deleted = sqlx::query("DELETE FROM account WHERE id = ?")
            .bind(id(account))
            .execute(db)
            .await?;
        Ok(deleted.rows_affected() > 0)
    })
    .await
}
