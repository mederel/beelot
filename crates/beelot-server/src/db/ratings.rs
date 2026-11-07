//! The `rating` and `rating_history` tables: each account's Glicko-2 rating per variant, and how it changed.

use sqlx::{FromRow, MySqlConnection, MySqlPool};
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::{from_utc, id, utc};
use crate::rating::Glicko;

/// An account's rating in one variant, with the number of rated matches behind it.
#[derive(Debug, Clone, PartialEq)]
pub struct StoredRating {
    pub variant: String,
    pub glicko: Glicko,
    pub matches: i32,
}

/// The rating after one rated match.
#[derive(Debug, Clone, PartialEq)]
pub struct HistoryPoint {
    pub variant: String,
    pub rating: f64,
    pub rated_at: OffsetDateTime,
}

#[derive(FromRow)]
struct RatingRow {
    variant: String,
    rating: f64,
    deviation: f64,
    volatility: f64,
    matches: i32,
}

impl RatingRow {
    fn stored(self) -> StoredRating {
        StoredRating {
            variant: self.variant,
            glicko: Glicko {
                rating: self.rating,
                deviation: self.deviation,
                volatility: self.volatility,
            },
            matches: self.matches,
        }
    }
}

#[derive(FromRow)]
struct HistoryRow {
    variant: String,
    rating: f64,
    rated_at: PrimitiveDateTime,
}

pub async fn find(
    db: &mut MySqlConnection,
    account: Uuid,
    variant: &str,
) -> sqlx::Result<Option<StoredRating>> {
    let row: Option<RatingRow> = sqlx::query_as(
        "SELECT variant, rating, deviation, volatility, matches FROM rating WHERE account_id = ? AND variant = ?",
    )
    .bind(id(account))
    .bind(variant)
    .fetch_optional(db)
    .await?;
    Ok(row.map(RatingRow::stored))
}

pub async fn save(
    db: &mut MySqlConnection,
    account: Uuid,
    stored: &StoredRating,
    match_id: Uuid,
    at: OffsetDateTime,
) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO rating (account_id, variant, rating, deviation, volatility, matches, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating), \
         deviation = VALUES(deviation), volatility = VALUES(volatility), matches = VALUES(matches), \
         updated_at = VALUES(updated_at)",
    )
    .bind(id(account))
    .bind(&stored.variant)
    .bind(stored.glicko.rating)
    .bind(stored.glicko.deviation)
    .bind(stored.glicko.volatility)
    .bind(stored.matches)
    .bind(utc(at))
    .execute(&mut *db)
    .await?;
    sqlx::query(
        "INSERT INTO rating_history (account_id, variant, match_id, rating, deviation, rated_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id(account))
    .bind(&stored.variant)
    .bind(id(match_id))
    .bind(stored.glicko.rating)
    .bind(stored.glicko.deviation)
    .bind(utc(at))
    .execute(&mut *db)
    .await?;
    Ok(())
}

/// The account's ratings, one per variant it has been rated in.
pub async fn of(pool: &MySqlPool, account: Uuid) -> sqlx::Result<Vec<StoredRating>> {
    let rows: Vec<RatingRow> = sqlx::query_as(
        "SELECT variant, rating, deviation, volatility, matches FROM rating WHERE account_id = ? ORDER BY variant",
    )
    .bind(id(account))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(RatingRow::stored).collect())
}

/// The account's rating after each rated match, oldest first.
pub async fn history(pool: &MySqlPool, account: Uuid) -> sqlx::Result<Vec<HistoryPoint>> {
    let rows: Vec<HistoryRow> = sqlx::query_as(
        "SELECT variant, rating, rated_at FROM rating_history WHERE account_id = ? ORDER BY rated_at, id",
    )
    .bind(id(account))
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| HistoryPoint {
            variant: row.variant,
            rating: row.rating,
            rated_at: from_utc(row.rated_at),
        })
        .collect())
}

/// Players listed on a leaderboard, and the rated matches they need to be listed.
pub const LEADERBOARD_SIZE: i64 = 50;
pub const MIN_MATCHES: i32 = 10;

#[derive(Debug, Clone, PartialEq)]
pub struct BoardEntry {
    pub name: String,
    pub rating: f64,
    pub matches: i32,
}

#[derive(FromRow)]
struct BoardRow {
    display_name: String,
    rating: f64,
    matches: i32,
}

/// The best-rated players of a variant, best first; players hidden by choice or with too few matches are left out.
pub async fn top(pool: &MySqlPool, variant: &str) -> sqlx::Result<Vec<BoardEntry>> {
    let rows: Vec<BoardRow> = sqlx::query_as(
        "SELECT a.display_name, r.rating, r.matches FROM rating r JOIN account a ON a.id = r.account_id \
         WHERE r.variant = ? AND r.matches >= ? AND a.leaderboard_hidden = FALSE \
         ORDER BY r.rating DESC, r.matches DESC, a.display_name LIMIT ?",
    )
    .bind(variant)
    .bind(MIN_MATCHES)
    .bind(LEADERBOARD_SIZE)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| BoardEntry {
            name: row.display_name,
            rating: row.rating,
            matches: row.matches,
        })
        .collect())
}

/// How many listed players of the variant have a strictly higher rating than `rating`.
pub async fn listed_above(pool: &MySqlPool, variant: &str, rating: f64) -> sqlx::Result<i64> {
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM rating r JOIN account a ON a.id = r.account_id \
         WHERE r.variant = ? AND r.matches >= ? AND a.leaderboard_hidden = FALSE AND r.rating > ?",
    )
    .bind(variant)
    .bind(MIN_MATCHES)
    .bind(rating)
    .fetch_one(pool)
    .await
}

pub async fn is_hidden(pool: &MySqlPool, account: Uuid) -> sqlx::Result<bool> {
    let hidden: Option<bool> =
        sqlx::query_scalar("SELECT leaderboard_hidden FROM account WHERE id = ?")
            .bind(id(account))
            .fetch_optional(pool)
            .await?;
    Ok(hidden.unwrap_or(false))
}

pub async fn set_hidden(pool: &MySqlPool, account: Uuid, hidden: bool) -> sqlx::Result<()> {
    sqlx::query("UPDATE account SET leaderboard_hidden = ? WHERE id = ?")
        .bind(hidden)
        .bind(id(account))
        .execute(pool)
        .await?;
    Ok(())
}

/// One account's rating in one variant, if it has one.
pub async fn of_variant(
    pool: &MySqlPool,
    account: Uuid,
    variant: &str,
) -> sqlx::Result<Option<StoredRating>> {
    let mut connection = pool.acquire().await?;
    find(&mut connection, account, variant).await
}
