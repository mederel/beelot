//! Sessions of signed-in players. The browser holds a random 256-bit token in the session cookie (`auth::cookies`); the
//! database keeps only its SHA-256. A session ends 7 days after its last use or 30 days after its sign-in, whichever
//! comes first; each end the server notices is recorded once as `SESSION_EXPIRED`.

use std::time::Duration;

use axum::http::HeaderMap;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};
use sqlx::MySqlPool;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::db::sessions::{self as store, StoredSession, TokenHash};
use crate::privacy::events::{self, EventType, Outcome};

pub const IDLE_LIMIT: Duration = Duration::from_secs(7 * 86_400);
pub const ABSOLUTE_LIMIT: Duration = Duration::from_secs(30 * 86_400);
/// `last_seen_at` is written at most this often.
const SEEN_EVERY: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurrentSession {
    pub account_id: Uuid,
    pub signed_in_at: OffsetDateTime,
    pub token_hash: TokenHash,
}

impl CurrentSession {
    /// Whether the session signed in less than `limit` ago.
    pub fn signed_in_recently(&self, now: OffsetDateTime, limit: Duration) -> bool {
        self.signed_in_at > now - limit
    }
}

pub fn hash(token: &str) -> TokenHash {
    Sha256::digest(token.as_bytes()).into()
}

/// The session token the request carries.
pub fn token(headers: &HeaderMap) -> Option<&str> {
    super::cookies::session_token(headers)
}

/// Starts a session for the account and returns its token.
pub async fn start(pool: &MySqlPool, account: Uuid, now: OffsetDateTime) -> sqlx::Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the operating system's random generator");
    let token = URL_SAFE_NO_PAD.encode(bytes);
    store::insert(
        pool,
        &StoredSession {
            token_hash: hash(&token),
            account_id: account,
            signed_in_at: now,
            last_seen_at: now,
        },
    )
    .await?;
    Ok(token)
}

/// Ends the session on purpose: it isn't an expiry.
pub async fn end(pool: &MySqlPool, token_hash: &TokenHash) -> sqlx::Result<bool> {
    store::delete(pool, token_hash).await
}

/// Ends every session of the account.
pub async fn end_all(pool: &MySqlPool, account: Uuid) -> sqlx::Result<u64> {
    store::delete_for_account(pool, account).await
}

fn expired(session: &StoredSession, now: OffsetDateTime) -> bool {
    session.last_seen_at + IDLE_LIMIT <= now || session.signed_in_at + ABSOLUTE_LIMIT <= now
}

async fn expire(
    pool: &MySqlPool,
    session: &StoredSession,
    now: OffsetDateTime,
) -> sqlx::Result<bool> {
    let ended = store::delete(pool, &session.token_hash).await?;
    if ended {
        events::record(
            pool,
            EventType::SessionExpired,
            Outcome::Success,
            Some(session.account_id),
            None,
            now,
        )
        .await;
    }
    Ok(ended)
}

/// How long the browser may keep the session cookie of a session signed in at `signed_in_at`, from `now`: until the session's
/// absolute limit, never longer (the server ends the session then anyway). Zero once the limit has passed.
pub fn cookie_max_age(signed_in_at: OffsetDateTime, now: OffsetDateTime) -> u32 {
    let left = (signed_in_at + ABSOLUTE_LIMIT - now).whole_seconds();
    left.clamp(0, ABSOLUTE_LIMIT.as_secs() as i64) as u32
}

/// The live session of that token. One past its limits is ended and recorded as an expiry; one in use has its
/// last use bumped, at most once a minute.
pub async fn lookup(
    pool: &MySqlPool,
    token: &str,
    now: OffsetDateTime,
) -> sqlx::Result<Option<CurrentSession>> {
    let Some(session) = store::find(pool, &hash(token)).await? else {
        return Ok(None);
    };
    if expired(&session, now) {
        expire(pool, &session, now).await?;
        return Ok(None);
    }
    if session.last_seen_at + SEEN_EVERY <= now {
        store::touch(pool, &session.token_hash, now).await?;
    }
    Ok(Some(CurrentSession {
        account_id: session.account_id,
        signed_in_at: session.signed_in_at,
        token_hash: session.token_hash,
    }))
}

/// The sessions ended and recorded by one statement of the sweep at most.
const SWEEP_BATCH: i64 = 500;

/// Ends every session past its limits in batches, recording each expiry once; returns how many ended.
pub async fn sweep_expired(pool: &MySqlPool, now: OffsetDateTime) -> sqlx::Result<u64> {
    let mut ended = 0;
    loop {
        let batch = store::end_expired_batch(
            pool,
            now - IDLE_LIMIT,
            now - ABSOLUTE_LIMIT,
            SWEEP_BATCH,
            (EventType::SessionExpired.name(), Outcome::Success.name()),
            now,
        )
        .await?;
        ended += batch;
        if batch < SWEEP_BATCH as u64 {
            return Ok(ended);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cookie_lasts_until_the_absolute_limit_and_no_longer() {
        let signed_in = OffsetDateTime::UNIX_EPOCH;
        assert_eq!(cookie_max_age(signed_in, signed_in), 30 * 86_400);
        assert_eq!(
            cookie_max_age(signed_in, signed_in + time::Duration::days(10)),
            20 * 86_400
        );
        assert_eq!(
            cookie_max_age(signed_in, signed_in + time::Duration::days(31)),
            0
        );
    }
}
