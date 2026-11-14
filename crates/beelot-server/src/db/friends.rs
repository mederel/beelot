//! The `friend_code`, `friendship` and `table_invite` tables (US-070).

use sqlx::{FromRow, MySqlPool};
use time::{OffsetDateTime, PrimitiveDateTime};
use uuid::Uuid;

use super::{DbUuid, from_utc, id, utc};

/// A friend, with when one of their sessions was last seen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    pub id: Uuid,
    pub name: String,
    pub last_seen: Option<OffsetDateTime>,
}

/// An invitation to a table, as its receiver sees it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invite {
    pub id: i64,
    pub from: String,
    pub table_id: Uuid,
    pub code: String,
}

#[derive(FromRow)]
struct PersonRow {
    id: DbUuid,
    display_name: String,
    last_seen: Option<PrimitiveDateTime>,
}

impl From<PersonRow> for Person {
    fn from(row: PersonRow) -> Self {
        Person {
            id: row.id.0,
            name: row.display_name,
            last_seen: row.last_seen.map(from_utc),
        }
    }
}

#[derive(FromRow)]
struct AccountRow {
    account_id: DbUuid,
}

#[derive(FromRow)]
struct CodeRow {
    code: String,
}

#[derive(FromRow)]
struct LinkRow {
    requester: DbUuid,
    accepted: bool,
}

#[derive(FromRow)]
struct InviteRow {
    id: i64,
    display_name: String,
    table_id: DbUuid,
    code: String,
}

/// The account's friend link code; `fresh` is kept when it has none yet.
pub async fn code_of(pool: &MySqlPool, account: Uuid, fresh: &str) -> sqlx::Result<String> {
    crate::traces::db("code_of", async move {
        sqlx::query("INSERT IGNORE INTO friend_code (account_id, code) VALUES (?, ?)")
            .bind(id(account))
            .bind(fresh)
            .execute(pool)
            .await?;
        let row: CodeRow = sqlx::query_as("SELECT code FROM friend_code WHERE account_id = ?")
            .bind(id(account))
            .fetch_one(pool)
            .await?;
        Ok(row.code)
    })
    .await
}

pub async fn account_for_code(pool: &MySqlPool, code: &str) -> sqlx::Result<Option<Uuid>> {
    crate::traces::db("account_for_code", async move {
        let row: Option<AccountRow> =
            sqlx::query_as("SELECT account_id FROM friend_code WHERE code = ?")
                .bind(code)
                .fetch_optional(pool)
                .await?;
        Ok(row.map(|row| row.account_id.0))
    })
    .await
}

/// The friendship between two accounts, if any: who asked, and whether it was accepted.
pub async fn between(
    pool: &MySqlPool,
    one: Uuid,
    other: Uuid,
) -> sqlx::Result<Option<(Uuid, bool)>> {
    crate::traces::db("between", async move {
        let row: Option<LinkRow> = sqlx::query_as(
            "SELECT requester, accepted FROM friendship \
         WHERE (requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?)",
        )
        .bind(id(one))
        .bind(id(other))
        .bind(id(other))
        .bind(id(one))
        .fetch_optional(pool)
        .await?;
        Ok(row.map(|row| (row.requester.0, row.accepted)))
    })
    .await
}

pub async fn request(
    pool: &MySqlPool,
    requester: Uuid,
    addressee: Uuid,
    now: OffsetDateTime,
) -> sqlx::Result<()> {
    crate::traces::db("request", async move {
    sqlx::query(
        "INSERT IGNORE INTO friendship (requester, addressee, accepted, created_at) VALUES (?, ?, FALSE, ?)",
    )
    .bind(id(requester))
    .bind(id(addressee))
    .bind(utc(now))
    .execute(pool)
    .await?;
    Ok(())
    })
    .await
}

/// The addressee accepts a request; true when there was one waiting.
pub async fn accept(pool: &MySqlPool, addressee: Uuid, requester: Uuid) -> sqlx::Result<bool> {
    crate::traces::db("accept", async move {
    let done = sqlx::query(
        "UPDATE friendship SET accepted = TRUE WHERE requester = ? AND addressee = ? AND accepted = FALSE",
    )
    .bind(id(requester))
    .bind(id(addressee))
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
    })
    .await
}

/// Removes a friend, or declines or withdraws a request; true when there was a friendship to remove.
pub async fn remove(pool: &MySqlPool, one: Uuid, other: Uuid) -> sqlx::Result<bool> {
    crate::traces::db("remove", async move {
    let done = sqlx::query(
        "DELETE FROM friendship WHERE (requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?)",
    )
    .bind(id(one))
    .bind(id(other))
    .bind(id(other))
    .bind(id(one))
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
    })
    .await
}

const SEEN: &str =
    "(SELECT MAX(s.last_seen_at) FROM session s WHERE s.account_id = a.id) AS last_seen";

async fn listed(
    pool: &MySqlPool,
    account: Uuid,
    mine: &str,
    theirs: &str,
    accepted: bool,
) -> sqlx::Result<Vec<Person>> {
    // `mine` and `theirs` are column names written in this file, never input, so the text is safe to build.
    let rows: Vec<PersonRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT a.id, a.display_name, {SEEN} FROM friendship f JOIN account a ON a.id = f.{theirs} \
         WHERE f.{mine} = ? AND f.accepted = ? ORDER BY a.display_name"
    )))
    .bind(id(account))
    .bind(accepted)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Person::from).collect())
}

/// The accepted friends, by name.
pub async fn friends(pool: &MySqlPool, account: Uuid) -> sqlx::Result<Vec<Person>> {
    crate::traces::db("friends", async move {
        let mut friends = listed(pool, account, "requester", "addressee", true).await?;
        friends.extend(listed(pool, account, "addressee", "requester", true).await?);
        friends.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(friends)
    })
    .await
}

/// Those who opened the account's link and wait to be accepted.
pub async fn requests(pool: &MySqlPool, account: Uuid) -> sqlx::Result<Vec<Person>> {
    crate::traces::db("requests", async move {
        listed(pool, account, "addressee", "requester", false).await
    })
    .await
}

/// Invitations last this long.
pub const INVITE_LIFETIME: time::Duration = time::Duration::minutes(10);

pub async fn invite(
    pool: &MySqlPool,
    from: Uuid,
    to: Uuid,
    table_id: Uuid,
    code: &str,
    now: OffsetDateTime,
) -> sqlx::Result<()> {
    crate::traces::db("invite", async move {
    sqlx::query("DELETE FROM table_invite WHERE created_at <= ? OR (from_account = ? AND to_account = ? AND table_id = ?)")
        .bind(utc(now - INVITE_LIFETIME))
        .bind(id(from))
        .bind(id(to))
        .bind(id(table_id))
        .execute(pool)
        .await?;
    sqlx::query(
        "INSERT INTO table_invite (from_account, to_account, table_id, code, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id(from))
    .bind(id(to))
    .bind(id(table_id))
    .bind(code)
    .bind(utc(now))
    .execute(pool)
    .await?;
    Ok(())
    })
    .await
}

pub async fn invites_for(
    pool: &MySqlPool,
    account: Uuid,
    now: OffsetDateTime,
) -> sqlx::Result<Vec<Invite>> {
    crate::traces::db("invites_for", async move {
    let rows: Vec<InviteRow> = sqlx::query_as(
        "SELECT i.id, a.display_name, i.table_id, i.code FROM table_invite i \
         JOIN account a ON a.id = i.from_account WHERE i.to_account = ? AND i.created_at > ? ORDER BY i.id DESC",
    )
    .bind(id(account))
    .bind(utc(now - INVITE_LIFETIME))
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| Invite {
            id: row.id,
            from: row.display_name,
            table_id: row.table_id.0,
            code: row.code,
        })
        .collect())
    })
    .await
}

pub async fn dismiss_invite(pool: &MySqlPool, account: Uuid, invite: i64) -> sqlx::Result<()> {
    crate::traces::db("dismiss_invite", async move {
        sqlx::query("DELETE FROM table_invite WHERE id = ? AND to_account = ?")
            .bind(invite)
            .bind(id(account))
            .execute(pool)
            .await?;
        Ok(())
    })
    .await
}
