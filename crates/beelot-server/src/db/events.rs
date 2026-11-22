//! The `security_event` table.

use std::net::IpAddr;

use sqlx::{Executor, FromRow, MySql};
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::{from_utc, id, utc};

pub async fn insert<'c>(
    db: impl Executor<'c, Database = MySql>,
    r#type: &str,
    outcome: &str,
    account: Option<Uuid>,
    ip: Option<IpAddr>,
    at: OffsetDateTime,
) -> sqlx::Result<()> {
    crate::traces::db("events.insert", async move {
        sqlx::query(
            "INSERT INTO security_event (account_id, type, outcome, ip_token, occurred_at) VALUES \
        (?, ?, ?, ?, ?)",
        )
        .bind(account.map(id))
        .bind(r#type)
        .bind(outcome)
        .bind(ip.map(crate::privacy::tokens::ip_token))
        .bind(utc(at))
        .execute(db)
        .await?;
        Ok(())
    })
    .await
}

/// A security event as the export shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredEvent {
    pub r#type: String,
    pub outcome: String,
    pub ip_token: Option<String>,
    pub occurred_at: OffsetDateTime,
}

#[derive(FromRow)]
struct Row {
    r#type: String,
    outcome: String,
    ip_token: Option<String>,
    occurred_at: PrimitiveDateTime,
}

/// The account's events, the latest first.
pub async fn of_account<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
) -> sqlx::Result<Vec<StoredEvent>> {
    crate::traces::db("events.of_account", async move {
        let rows: Vec<Row> = sqlx::query_as(
            "SELECT type, outcome, ip_token, occurred_at FROM security_event WHERE account_id = ? \
             ORDER BY occurred_at DESC, id DESC",
        )
        .bind(id(account))
        .fetch_all(db)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| StoredEvent {
                r#type: row.r#type,
                outcome: row.outcome,
                ip_token: row.ip_token,
                occurred_at: from_utc(row.occurred_at),
            })
            .collect())
    })
    .await
}

/// When the account last exported its data.
pub async fn last_export<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
) -> sqlx::Result<Option<OffsetDateTime>> {
    crate::traces::db("events.last_export", async move {
        let last: Option<PrimitiveDateTime> = sqlx::query_scalar(
            "SELECT MAX(occurred_at) FROM security_event WHERE account_id = ? AND type = 'EXPORT'",
        )
        .bind(id(account))
        .fetch_one(db)
        .await?;
        Ok(last.map(from_utc))
    })
    .await
}

/// Deletes the account's events.
pub async fn delete_of_account<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
) -> sqlx::Result<()> {
    crate::traces::db("events.delete_of_account", async move {
        sqlx::query("DELETE FROM security_event WHERE account_id = ?")
            .bind(id(account))
            .execute(db)
            .await?;
        Ok(())
    })
    .await
}

/// Deletes the events older than `before`; how many went.
pub async fn purge_before<'c>(
    db: impl Executor<'c, Database = MySql>,
    before: OffsetDateTime,
) -> sqlx::Result<u64> {
    crate::traces::db("events.purge_before", async move {
        let purged = sqlx::query("DELETE FROM security_event WHERE occurred_at < ?")
            .bind(utc(before))
            .execute(db)
            .await?;
        Ok(purged.rows_affected())
    })
    .await
}
