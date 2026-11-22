//! The saved tables (US-169): `saved_table`, `table_event`, `table_token` and `table_seat_link`.
//!
//! What the store has already written of a table is kept in memory (US-172): how many events it holds, which tokens and
//! which links. A change then sends only what differs, in a few statements, and the table's events are never counted.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, PoisonError};

use futures_util::future::BoxFuture;
use sqlx::{MySql, MySqlConnection, MySqlPool, QueryBuilder};
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::{DbUuid, from_utc, id, utc};
use crate::history::recorder::HistoryRecorder;
use crate::tables::store::{Change, FORMAT, Stored, StoredEntry, TableStore};

/// The rows of events, of tokens and the ids of tables in one statement.
const ROWS: usize = 200;
const IDS: usize = 500;

/// What is known to be saved of a table.
#[derive(Debug)]
struct Saved {
    /// The number of events saved.
    held: usize,
    /// The tokens saved (hash, actor); none while not known, then the next change of tokens replaces them all.
    tokens: Option<HashMap<String, String>>,
    /// The links saved, or tried: a link of an account deleted since is not saved and is not tried again.
    links: HashSet<Uuid>,
}

/// Saves the tables in MariaDB. A match a change finishes goes into the history in the same transaction.
#[derive(Debug, Clone)]
pub struct DbTableStore {
    pool: MySqlPool,
    saved: Arc<Mutex<HashMap<Uuid, Saved>>>,
}

impl DbTableStore {
    pub fn new(pool: MySqlPool) -> Self {
        Self {
            pool,
            saved: Arc::default(),
        }
    }

    fn known(&self) -> std::sync::MutexGuard<'_, HashMap<Uuid, Saved>> {
        self.saved.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Writes the change. What the store knew of the table is taken out first and put back only when every statement
    /// worked, so that a failure leaves the next change to find out again what is saved.
    async fn write(&self, change: &Change) -> sqlx::Result<()> {
        let known = self.known().remove(&change.table);
        let mut tx = self.pool.begin().await?;
        let table = id(change.table);
        if let Some(at) = change.last_activity {
            match (&known, &change.origin) {
                (Some(_), _) => {
                    sqlx::query("UPDATE saved_table SET last_activity = ? WHERE table_id = ?")
                        .bind(utc(at))
                        .bind(table)
                        .execute(&mut *tx)
                        .await?;
                }
                (None, Some(origin)) => {
                    sqlx::query(
                        "INSERT INTO saved_table (table_id, format, origin, last_activity) \
                         VALUES (?, ?, ?, ?) \
                         ON DUPLICATE KEY UPDATE last_activity = VALUES(last_activity)",
                    )
                    .bind(table)
                    .bind(FORMAT)
                    .bind(&**origin)
                    .bind(utc(at))
                    .execute(&mut *tx)
                    .await?;
                }
                (None, None) => {}
            }
        }
        let mut held = known.as_ref().map(|saved| saved.held);
        if let Some(from) = change.from {
            match append(&mut tx, change, from, held).await? {
                Some(now) => held = Some(now),
                None => {
                    // A hole in the events: nothing of this change is kept, and what it finished still counts.
                    tx.rollback().await?;
                    return self.history_only(change).await;
                }
            }
        }
        let (old_tokens, mut links) = match known {
            Some(saved) => (saved.tokens, saved.links),
            None => (None, HashSet::new()),
        };
        let tokens = match &change.tokens {
            Some(tokens) => {
                let tokens: HashMap<String, String> = tokens.iter().cloned().collect();
                write_tokens(&mut tx, change.table, old_tokens.as_ref(), &tokens).await?;
                Some(tokens)
            }
            None => old_tokens,
        };
        for (link, account) in &change.links {
            if links.insert(*link) {
                link_seat(&mut tx, change.table, *link, *account).await?;
            }
        }
        for finished in &change.finished {
            HistoryRecorder::store_in(&mut tx, finished).await?;
        }
        tx.commit().await?;
        if let Some(held) = held {
            self.known().insert(
                change.table,
                Saved {
                    held,
                    tokens,
                    links,
                },
            );
        }
        Ok(())
    }

    /// The finished matches of a change whose events could not be saved are still recorded.
    async fn history_only(&self, change: &Change) -> sqlx::Result<()> {
        let mut tx = self.pool.begin().await?;
        for finished in &change.finished {
            HistoryRecorder::store_in(&mut tx, finished).await?;
        }
        tx.commit().await
    }

    /// The tables active since `since`, with their events, tokens and links read a few statements at a time.
    async fn read(&self, since: OffsetDateTime) -> sqlx::Result<Vec<Stored>> {
        let rows: Vec<(DbUuid, i16, String, PrimitiveDateTime)> = sqlx::query_as(
            "SELECT table_id, format, origin, last_activity FROM saved_table \
             WHERE last_activity >= ? ORDER BY last_activity",
        )
        .bind(utc(since))
        .fetch_all(&self.pool)
        .await?;
        let mut events: HashMap<Uuid, Vec<StoredEntry>> = HashMap::new();
        let mut tokens: HashMap<Uuid, Vec<(String, String)>> = HashMap::new();
        let mut links: HashMap<Uuid, Vec<(Uuid, Uuid)>> = HashMap::new();
        for chunk in rows.chunks(IDS) {
            let ids: Vec<Hyphen> = chunk.iter().map(|(DbUuid(table), ..)| id(*table)).collect();
            let found: Vec<(DbUuid, i32, i64, PrimitiveDateTime, String)> = in_list(
                "SELECT table_id, seq, version, at, event FROM table_event WHERE table_id IN ",
                &ids,
                " ORDER BY table_id, seq",
            )
            .build_query_as()
            .fetch_all(&self.pool)
            .await?;
            for (DbUuid(table), seq, version, at, event) in found {
                events.entry(table).or_default().push(StoredEntry {
                    // A number that is not one makes a hole the revival finds.
                    seq: usize::try_from(seq).unwrap_or(usize::MAX),
                    version: u64::try_from(version).unwrap_or(0),
                    at: from_utc(at),
                    event,
                });
            }
            let found: Vec<(DbUuid, String, String)> = in_list(
                "SELECT table_id, token_hash, actor FROM table_token WHERE table_id IN ",
                &ids,
                "",
            )
            .build_query_as()
            .fetch_all(&self.pool)
            .await?;
            for (DbUuid(table), hash, actor) in found {
                tokens.entry(table).or_default().push((hash, actor));
            }
            let found: Vec<(DbUuid, DbUuid, DbUuid)> = in_list(
                "SELECT table_id, link, account_id FROM table_seat_link WHERE table_id IN ",
                &ids,
                "",
            )
            .build_query_as()
            .fetch_all(&self.pool)
            .await?;
            for (DbUuid(table), DbUuid(link), DbUuid(account)) in found {
                links.entry(table).or_default().push((link, account));
            }
        }
        let mut stored = Vec::with_capacity(rows.len());
        for (DbUuid(table), format, origin, last_activity) in rows {
            let entries = events.remove(&table).unwrap_or_default();
            let tokens = tokens.remove(&table).unwrap_or_default();
            let links = links.remove(&table).unwrap_or_default();
            self.known().insert(
                table,
                Saved {
                    held: entries.len(),
                    tokens: Some(tokens.iter().cloned().collect()),
                    links: links.iter().map(|(link, _)| *link).collect(),
                },
            );
            stored.push(Stored {
                id: table,
                format,
                origin,
                last_activity: from_utc(last_activity),
                entries,
                tokens,
                links,
            });
        }
        Ok(stored)
    }
}

type Hyphen = uuid::fmt::Hyphenated;

/// `head (?, ?, ...) tail` with the ids bound.
fn in_list(head: &str, ids: &[Hyphen], tail: &str) -> QueryBuilder<MySql> {
    let mut query = QueryBuilder::new(head);
    query.push("(");
    let mut list = query.separated(", ");
    for table in ids {
        list.push_bind(*table);
    }
    query.push(")");
    query.push(tail);
    query
}

/// Appends the change's events after the `from` events held. Gives the number of events held now, or none when fewer
/// than `from` are held: a hole. `held` is what the store knows, counted from the database when it does not.
async fn append(
    tx: &mut MySqlConnection,
    change: &Change,
    from: usize,
    held: Option<usize>,
) -> sqlx::Result<Option<usize>> {
    let table = id(change.table);
    let held = match held {
        Some(held) => held,
        None => {
            let count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM table_event WHERE table_id = ?")
                    .bind(table)
                    .fetch_one(&mut *tx)
                    .await?;
            usize::try_from(count).unwrap_or(0)
        }
    };
    if held < from {
        tracing::warn!(
            table = %change.table,
            held,
            from,
            "a saved table has a hole in its events, so it is not saved further"
        );
        return Ok(None);
    }
    if held > from {
        sqlx::query("DELETE FROM table_event WHERE table_id = ? AND seq >= ?")
            .bind(table)
            .bind(i32::try_from(from).unwrap_or(i32::MAX))
            .execute(&mut *tx)
            .await?;
    }
    for entries in change.entries.chunks(ROWS) {
        let mut query =
            QueryBuilder::new("INSERT INTO table_event (table_id, seq, version, at, event) ");
        query.push_values(entries, |mut row, entry| {
            row.push_bind(table)
                .push_bind(i32::try_from(entry.seq).unwrap_or(i32::MAX))
                .push_bind(i64::try_from(entry.version).unwrap_or(i64::MAX))
                .push_bind(utc(entry.at))
                .push_bind(&entry.event);
        });
        query.build().execute(&mut *tx).await?;
    }
    Ok(Some(from + change.entries.len()))
}

/// Brings the saved tokens to `tokens`: the difference with `old` when it is known, all of them otherwise.
async fn write_tokens(
    tx: &mut MySqlConnection,
    table: Uuid,
    old: Option<&HashMap<String, String>>,
    tokens: &HashMap<String, String>,
) -> sqlx::Result<()> {
    let table = id(table);
    let (gone, added): (Vec<&String>, Vec<(&String, &String)>) = match old {
        Some(old) => (
            old.keys()
                .filter(|hash| !tokens.contains_key(*hash))
                .collect(),
            tokens
                .iter()
                .filter(|(hash, actor)| old.get(*hash) != Some(*actor))
                .collect(),
        ),
        None => {
            sqlx::query("DELETE FROM table_token WHERE table_id = ?")
                .bind(table)
                .execute(&mut *tx)
                .await?;
            (Vec::new(), tokens.iter().collect())
        }
    };
    for hashes in gone.chunks(ROWS) {
        let mut query = QueryBuilder::new("DELETE FROM table_token WHERE table_id = ");
        query.push_bind(table);
        query.push(" AND token_hash IN (");
        let mut list = query.separated(", ");
        for hash in hashes {
            list.push_bind(*hash);
        }
        query.push(")");
        query.build().execute(&mut *tx).await?;
    }
    for rows in added.chunks(ROWS) {
        let mut query = QueryBuilder::new("INSERT INTO table_token (table_id, token_hash, actor) ");
        query.push_values(rows, |mut row, (hash, actor)| {
            row.push_bind(table).push_bind(*hash).push_bind(*actor);
        });
        query.push(" ON DUPLICATE KEY UPDATE actor = VALUES(actor)");
        query.build().execute(&mut *tx).await?;
    }
    Ok(())
}

/// An account deleted since the seat was taken leaves no link.
async fn link_seat(
    tx: &mut MySqlConnection,
    table: Uuid,
    link: Uuid,
    account: Uuid,
) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT IGNORE INTO table_seat_link (table_id, link, account_id) \
         SELECT ?, ?, id FROM account WHERE id = ?",
    )
    .bind(id(table))
    .bind(id(link))
    .bind(id(account))
    .execute(&mut *tx)
    .await?;
    Ok(())
}

impl TableStore for DbTableStore {
    fn save(&self, change: Change) -> BoxFuture<'_, ()> {
        Box::pin(crate::traces::db("tables.save", async move {
            if let Err(error) = self.write(&change).await {
                tracing::warn!(%error, table = %change.table, "could not save a table");
            }
        }))
    }

    fn remove(&self, table: Uuid) -> BoxFuture<'_, ()> {
        Box::pin(crate::traces::db("tables.remove", async move {
            self.known().remove(&table);
            if let Err(error) = sqlx::query("DELETE FROM saved_table WHERE table_id = ?")
                .bind(id(table))
                .execute(&self.pool)
                .await
            {
                tracing::warn!(%error, %table, "could not delete a saved table");
            }
        }))
    }

    fn load_active(&self, since: OffsetDateTime) -> BoxFuture<'_, Vec<Stored>> {
        Box::pin(crate::traces::db("tables.load_active", async move {
            self.read(since).await.unwrap_or_else(|error| {
                tracing::warn!(%error, "could not read the saved tables, so none is restored");
                Vec::new()
            })
        }))
    }
}

/// Deletes the saved tables whose last activity is before `before`; the retention job's leftovers.
pub async fn purge(pool: &MySqlPool, before: OffsetDateTime) -> sqlx::Result<u64> {
    crate::traces::db("tables.purge", async move {
        let purged = sqlx::query("DELETE FROM saved_table WHERE last_activity < ?")
            .bind(utc(before))
            .execute(pool)
            .await?;
        Ok(purged.rows_affected())
    })
    .await
}

/// Clears the links from the events to this account: the saved tables keep the seat with no account.
pub async fn forget_account(db: &mut MySqlConnection, account: Uuid) -> sqlx::Result<()> {
    crate::traces::db("tables.forget_account", async move {
        sqlx::query("DELETE FROM table_seat_link WHERE account_id = ?")
            .bind(id(account))
            .execute(db)
            .await?;
        Ok(())
    })
    .await
}

/// The saved tables the account sits at, with their last activity (the export, US-082).
pub async fn of_account(
    pool: &MySqlPool,
    account: Uuid,
) -> sqlx::Result<Vec<(Uuid, OffsetDateTime)>> {
    crate::traces::db("tables.of_account", async move {
        let rows: Vec<(DbUuid, PrimitiveDateTime)> = sqlx::query_as(
            "SELECT t.table_id, t.last_activity FROM saved_table t \
             JOIN table_seat_link l ON l.table_id = t.table_id WHERE l.account_id = ? \
             ORDER BY t.last_activity DESC",
        )
        .bind(id(account))
        .fetch_all(pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(DbUuid(table), at)| (table, from_utc(at)))
            .collect())
    })
    .await
}
