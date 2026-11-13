//! The `daily_attempt` table: who played each day's deal, and the score of their round.

use sqlx::{FromRow, MySqlPool};
use time::Date;
use uuid::Uuid;

use super::id;

/// How many scores the day's board lists.
pub const BOARD_SIZE: i64 = 10;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardEntry {
    pub name: String,
    pub score: i32,
}

#[derive(FromRow)]
struct BoardRow {
    display_name: String,
    score: i32,
}

/// Claims the day's attempt; false when the account already has one, finished or not.
pub async fn claim(pool: &MySqlPool, day: Date, account: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query("INSERT IGNORE INTO daily_attempt (day, account_id) VALUES (?, ?)")
        .bind(day)
        .bind(id(account))
        .execute(pool)
        .await?;
    Ok(result.rows_affected() == 1)
}

/// Gives back an attempt that never started (the table could not be made).
pub async fn release(pool: &MySqlPool, day: Date, account: Uuid) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM daily_attempt WHERE day = ? AND account_id = ? AND score IS NULL")
        .bind(day)
        .bind(id(account))
        .execute(pool)
        .await?;
    Ok(())
}

/// Stores the score of the attempt, once.
pub async fn record(pool: &MySqlPool, day: Date, account: Uuid, score: i32) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE daily_attempt SET score = ? WHERE day = ? AND account_id = ? AND score IS NULL",
    )
    .bind(score)
    .bind(day)
    .bind(id(account))
    .execute(pool)
    .await?;
    Ok(())
}

/// Whether the account has an attempt on that day, and its score once the round is over.
pub async fn attempt(
    pool: &MySqlPool,
    day: Date,
    account: Uuid,
) -> sqlx::Result<Option<Option<i32>>> {
    sqlx::query_scalar("SELECT score FROM daily_attempt WHERE day = ? AND account_id = ?")
        .bind(day)
        .bind(id(account))
        .fetch_optional(pool)
        .await
}

/// The day's best scores, best first; players hidden from the leaderboards (US-069) are left out.
pub async fn top(pool: &MySqlPool, day: Date) -> sqlx::Result<Vec<BoardEntry>> {
    let rows: Vec<BoardRow> = sqlx::query_as(
        "SELECT a.display_name, d.score FROM daily_attempt d JOIN account a ON a.id = d.account_id \
         WHERE d.day = ? AND d.score IS NOT NULL AND a.leaderboard_hidden = FALSE \
         ORDER BY d.score DESC, a.display_name LIMIT ?",
    )
    .bind(day)
    .bind(BOARD_SIZE)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| BoardEntry {
            name: row.display_name,
            score: row.score,
        })
        .collect())
}

/// How many listed players scored strictly more than `score` that day.
pub async fn listed_above(pool: &MySqlPool, day: Date, score: i32) -> sqlx::Result<i64> {
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM daily_attempt d JOIN account a ON a.id = d.account_id \
         WHERE d.day = ? AND d.score > ? AND a.leaderboard_hidden = FALSE",
    )
    .bind(day)
    .bind(score)
    .fetch_one(pool)
    .await
}
