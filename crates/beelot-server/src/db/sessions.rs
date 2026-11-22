//! The `session` table: signed-in browsers, keyed by the SHA-256 of their cookie's token.

use sqlx::{Executor, FromRow, MySql, MySqlPool, QueryBuilder};
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::{DbUuid, from_utc, id, utc};

pub type TokenHash = [u8; 32];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredSession {
    pub token_hash: TokenHash,
    pub account_id: Uuid,
    pub signed_in_at: OffsetDateTime,
    pub last_seen_at: OffsetDateTime,
}

#[derive(FromRow)]
struct Row {
    token_hash: Vec<u8>,
    account_id: DbUuid,
    signed_in_at: PrimitiveDateTime,
    last_seen_at: PrimitiveDateTime,
}

impl From<Row> for StoredSession {
    fn from(row: Row) -> Self {
        Self {
            token_hash: row.token_hash.try_into().unwrap_or([0; 32]),
            account_id: row.account_id.0,
            signed_in_at: from_utc(row.signed_in_at),
            last_seen_at: from_utc(row.last_seen_at),
        }
    }
}

pub async fn insert<'c>(
    db: impl Executor<'c, Database = MySql>,
    session: &StoredSession,
) -> sqlx::Result<()> {
    crate::traces::db("sessions.insert", async move {
        sqlx::query(
            "INSERT INTO session (token_hash, account_id, signed_in_at, last_seen_at) \
    VALUES (?, ?, ?, ?)",
        )
        .bind(&session.token_hash[..])
        .bind(id(session.account_id))
        .bind(utc(session.signed_in_at))
        .bind(utc(session.last_seen_at))
        .execute(db)
        .await?;
        Ok(())
    })
    .await
}

pub async fn find<'c>(
    db: impl Executor<'c, Database = MySql>,
    token_hash: &TokenHash,
) -> sqlx::Result<Option<StoredSession>> {
    crate::traces::db("sessions.find", async move {
        let row: Option<Row> = sqlx::query_as(
            "SELECT token_hash, account_id, signed_in_at, last_seen_at FROM session WHERE \
        token_hash = ?",
        )
        .bind(&token_hash[..])
        .fetch_optional(db)
        .await?;
        Ok(row.map(StoredSession::from))
    })
    .await
}

/// Deletes the session; false when it was already gone.
pub async fn delete<'c>(
    db: impl Executor<'c, Database = MySql>,
    token_hash: &TokenHash,
) -> sqlx::Result<bool> {
    crate::traces::db("sessions.delete", async move {
        let deleted = sqlx::query("DELETE FROM session WHERE token_hash = ?")
            .bind(&token_hash[..])
            .execute(db)
            .await?;
        Ok(deleted.rows_affected() > 0)
    })
    .await
}

pub async fn delete_for_account<'c>(
    db: impl Executor<'c, Database = MySql>,
    account: Uuid,
) -> sqlx::Result<u64> {
    crate::traces::db("sessions.delete_for_account", async move {
        let deleted = sqlx::query("DELETE FROM session WHERE account_id = ?")
            .bind(id(account))
            .execute(db)
            .await?;
        Ok(deleted.rows_affected())
    })
    .await
}

pub async fn touch<'c>(
    db: impl Executor<'c, Database = MySql>,
    token_hash: &TokenHash,
    now: OffsetDateTime,
) -> sqlx::Result<()> {
    crate::traces::db("sessions.touch", async move {
        sqlx::query("UPDATE session SET last_seen_at = ? WHERE token_hash = ?")
            .bind(utc(now))
            .bind(&token_hash[..])
            .execute(db)
            .await?;
        Ok(())
    })
    .await
}

/// Ends up to `limit` sessions last seen at or before `idle_before`, or signed in at or before `signed_in_before`, and records
/// one `event_type` event for each, all in one transaction; returns how many ended (US-186).
///
/// The rows are locked by the read, so a request that ends one of them at the same moment waits and finds it gone: each session
/// ends, and is recorded, exactly once.
pub async fn end_expired_batch(
    pool: &MySqlPool,
    idle_before: OffsetDateTime,
    signed_in_before: OffsetDateTime,
    limit: i64,
    (event_type, outcome): (&str, &str),
    now: OffsetDateTime,
) -> sqlx::Result<u64> {
    crate::traces::db("sessions.end_expired_batch", async move {
        let mut transaction = pool.begin().await?;
        let rows: Vec<Row> = sqlx::query_as(
            "SELECT token_hash, account_id, signed_in_at, last_seen_at FROM session \
         WHERE last_seen_at <= ? OR signed_in_at <= ? LIMIT ? FOR UPDATE",
        )
        .bind(utc(idle_before))
        .bind(utc(signed_in_before))
        .bind(limit)
        .fetch_all(&mut *transaction)
        .await?;
        if rows.is_empty() {
            return Ok(0);
        }
        let mut delete = QueryBuilder::<MySql>::new("DELETE FROM session WHERE token_hash IN (");
        let mut hashes = delete.separated(", ");
        for row in &rows {
            hashes.push_bind(&row.token_hash[..]);
        }
        delete.push(")");
        let ended = delete
            .build()
            .execute(&mut *transaction)
            .await?
            .rows_affected();
        let accounts: Vec<Uuid> = rows.iter().map(|row| row.account_id.0).collect();
        super::events::insert_many(&mut transaction, event_type, outcome, &accounts, now).await?;
        transaction.commit().await?;
        Ok(ended)
    })
    .await
}
