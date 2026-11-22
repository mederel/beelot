//! Deleting an account and everything Beelot keeps about it: its security events and, by cascade, its passkey and
//! sessions. Finished matches stay in the other players' history, with the account's seats renamed "Deleted player"
//! and linked to no account. Once that is committed, the account's live table seats go to bots and an anonymous
//! deletion event is recorded.

use std::net::IpAddr;

use uuid::Uuid;

use crate::app::AppState;
use crate::auth::sessions;
use crate::db::{accounts, events, matches};
use crate::privacy::events::{EventType, Outcome};
use crate::tables::finished::DELETED_PLAYER;

/// Deletes the account; `ip` is the client's when a player asks, none for the retention job.
pub async fn delete(state: &AppState, account: Uuid, ip: Option<IpAddr>) -> sqlx::Result<()> {
    let mut transaction = state.pool.begin().await?;
    matches::anonymize_seats(&mut *transaction, account, DELETED_PLAYER).await?;
    // The saved tables keep the seat, not whose it was (US-169).
    crate::db::tables::forget_account(&mut transaction, account).await?;
    events::delete_of_account(&mut *transaction, account).await?;
    accounts::delete(&mut *transaction, account).await?;
    transaction.commit().await?;

    state.hand_over(state.registry.release_account(account).await);
    if let Err(error) = sessions::end_all(&state.pool, account).await {
        tracing::warn!(%error, "an account was deleted, but its sessions could not be ended");
    }
    state
        .events
        .record(EventType::Deletion, Outcome::Success, None, ip)
        .await;
    Ok(())
}
