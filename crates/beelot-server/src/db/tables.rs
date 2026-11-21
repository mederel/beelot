//! The saved tables (US-169): `saved_table`, `table_event`, `table_token` and `table_seat_link`.

use futures_util::future::BoxFuture;
use sqlx::{MySqlConnection, MySqlPool};
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::{DbUuid, from_utc, id, utc};
use crate::history::recorder::HistoryRecorder;
use crate::tables::store::{Change, FORMAT, Stored, StoredEntry, TableStore};

/// Saves the tables in MariaDB. A match a change finishes goes into the history in the same transaction.
#[derive(Debug, Clone)]
pub struct DbTableStore {
    pool: MySqlPool,
}

impl DbTableStore {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }

    async fn write(&self, change: &Change) -> sqlx::Result<()> {
        let mut tx = self.pool.begin().await?;
        let table = id(change.table);
        if let (Some(origin), Some(at)) = (&change.origin, change.last_activity) {
            sqlx::query(
                "INSERT INTO saved_table (table_id, format, origin, last_activity) VALUES (?, ?, ?, ?) \
                 ON DUPLICATE KEY UPDATE last_activity = VALUES(last_activity)",
            )
            .bind(table)
            .bind(FORMAT)
            .bind(&**origin)
            .bind(utc(at))
            .execute(&mut *tx)
            .await?;
        }
        if let Some(from) = change.from
            && !append(&mut tx, change, from).await?
        {
            // A hole in the events: nothing of this change is kept, and what it finished still counts.
            tx.rollback().await?;
            return self.history_only(change).await;
        }
        if let Some(tokens) = &change.tokens {
            sqlx::query("DELETE FROM table_token WHERE table_id = ?")
                .bind(table)
                .execute(&mut *tx)
                .await?;
            for (hash, actor) in tokens {
                sqlx::query(
                    "INSERT INTO table_token (table_id, token_hash, actor) VALUES (?, ?, ?)",
                )
                .bind(table)
                .bind(hash)
                .bind(actor)
                .execute(&mut *tx)
                .await?;
            }
        }
        for (link, account) in &change.links {
            // An account deleted since the seat was taken leaves no link.
            sqlx::query(
                "INSERT IGNORE INTO table_seat_link (table_id, link, account_id) \
                 SELECT ?, ?, id FROM account WHERE id = ?",
            )
            .bind(table)
            .bind(id(*link))
            .bind(id(*account))
            .execute(&mut *tx)
            .await?;
        }
        for finished in &change.finished {
            HistoryRecorder::store_in(&mut tx, finished).await?;
        }
        tx.commit().await
    }

    /// The finished matches of a change whose events could not be saved are still recorded.
    async fn history_only(&self, change: &Change) -> sqlx::Result<()> {
        let mut tx = self.pool.begin().await?;
        for finished in &change.finished {
            HistoryRecorder::store_in(&mut tx, finished).await?;
        }
        tx.commit().await
    }

    async fn read(&self, since: OffsetDateTime) -> sqlx::Result<Vec<Stored>> {
        let rows: Vec<(DbUuid, i16, String, PrimitiveDateTime)> = sqlx::query_as(
            "SELECT table_id, format, origin, last_activity FROM saved_table WHERE last_activity >= ? \
             ORDER BY last_activity",
        )
        .bind(utc(since))
        .fetch_all(&self.pool)
        .await?;
        let mut stored = Vec::with_capacity(rows.len());
        for (DbUuid(table), format, origin, last_activity) in rows {
            let events: Vec<(i32, i64, PrimitiveDateTime, String)> = sqlx::query_as(
                "SELECT seq, version, at, event FROM table_event WHERE table_id = ? ORDER BY seq",
            )
            .bind(id(table))
            .fetch_all(&self.pool)
            .await?;
            let tokens: Vec<(String, String)> =
                sqlx::query_as("SELECT token_hash, actor FROM table_token WHERE table_id = ?")
                    .bind(id(table))
                    .fetch_all(&self.pool)
                    .await?;
            let links: Vec<(DbUuid, DbUuid)> =
                sqlx::query_as("SELECT link, account_id FROM table_seat_link WHERE table_id = ?")
                    .bind(id(table))
                    .fetch_all(&self.pool)
                    .await?;
            stored.push(Stored {
                id: table,
                format,
                origin,
                last_activity: from_utc(last_activity),
                entries: events
                    .into_iter()
                    .map(|(seq, version, at, event)| StoredEntry {
                        // A number that is not one makes a hole the revival finds.
                        seq: usize::try_from(seq).unwrap_or(usize::MAX),
                        version: u64::try_from(version).unwrap_or(0),
                        at: from_utc(at),
                        event,
                    })
                    .collect(),
                tokens,
                links: links
                    .into_iter()
                    .map(|(DbUuid(link), DbUuid(account))| (link, account))
                    .collect(),
            });
        }
        Ok(stored)
    }
}

/// Appends the change's events after the `from` events held. False when fewer are held: a hole.
async fn append(tx: &mut MySqlConnection, change: &Change, from: usize) -> sqlx::Result<bool> {
    let table = id(change.table);
    let held: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM table_event WHERE table_id = ?")
        .bind(table)
        .fetch_one(&mut *tx)
        .await?;
    let held = usize::try_from(held).unwrap_or(0);
    if held < from {
        tracing::warn!(table = %change.table, held, from, "a saved table has a hole in its events, so it is not saved further");
        return Ok(false);
    }
    if held > from {
        sqlx::query("DELETE FROM table_event WHERE table_id = ? AND seq >= ?")
            .bind(table)
            .bind(i32::try_from(from).unwrap_or(i32::MAX))
            .execute(&mut *tx)
            .await?;
    }
    for entry in &change.entries {
        sqlx::query(
            "INSERT INTO table_event (table_id, seq, version, at, event) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(table)
        .bind(i32::try_from(entry.seq).unwrap_or(i32::MAX))
        .bind(i64::try_from(entry.version).unwrap_or(i64::MAX))
        .bind(utc(entry.at))
        .bind(&entry.event)
        .execute(&mut *tx)
        .await?;
    }
    Ok(true)
}

impl TableStore for DbTableStore {
    fn save(&self, change: Change) -> BoxFuture<'_, ()> {
        Box::pin(async move {
            if let Err(error) = self.write(&change).await {
                tracing::warn!(%error, table = %change.table, "could not save a table");
            }
        })
    }

    fn remove(&self, table: Uuid) -> BoxFuture<'_, ()> {
        Box::pin(async move {
            if let Err(error) = sqlx::query("DELETE FROM saved_table WHERE table_id = ?")
                .bind(id(table))
                .execute(&self.pool)
                .await
            {
                tracing::warn!(%error, %table, "could not delete a saved table");
            }
        })
    }

    fn load_active(&self, since: OffsetDateTime) -> BoxFuture<'_, Vec<Stored>> {
        Box::pin(async move {
            self.read(since).await.unwrap_or_else(|error| {
                tracing::warn!(%error, "could not read the saved tables, so none is restored");
                Vec::new()
            })
        })
    }
}

/// Deletes the saved tables whose last activity is before `before`; the retention job's leftovers.
pub async fn purge(pool: &MySqlPool, before: OffsetDateTime) -> sqlx::Result<u64> {
    let purged = sqlx::query("DELETE FROM saved_table WHERE last_activity < ?")
        .bind(utc(before))
        .execute(pool)
        .await?;
    Ok(purged.rows_affected())
}

/// Clears the links from the events to this account: the saved tables keep the seat with no account.
pub async fn forget_account(db: &mut MySqlConnection, account: Uuid) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM table_seat_link WHERE account_id = ?")
        .bind(id(account))
        .execute(db)
        .await?;
    Ok(())
}

/// The saved tables the account sits at, with their last activity (the export, US-082).
pub async fn of_account(
    pool: &MySqlPool,
    account: Uuid,
) -> sqlx::Result<Vec<(Uuid, OffsetDateTime)>> {
    let rows: Vec<(DbUuid, PrimitiveDateTime)> = sqlx::query_as(
        "SELECT t.table_id, t.last_activity FROM saved_table t \
         JOIN table_seat_link l ON l.table_id = t.table_id WHERE l.account_id = ? ORDER BY t.last_activity DESC",
    )
    .bind(id(account))
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(DbUuid(table), at)| (table, from_utc(at)))
        .collect())
}
