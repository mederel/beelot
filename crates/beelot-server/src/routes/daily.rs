//! The daily deal (US-150). `GET /api/daily` says which deal is on, the board of the day or of yesterday, and the
//! signed-in player's own attempt; `POST /api/daily` opens today's table, once per signed-in account.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use time::{Date, UtcOffset};
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::MaybeSession;
use crate::db::daily;
use crate::error::AppError;
use crate::tables::daily::{deal_seed, ranks, variant_of};
use crate::tables::messages as msg;
use beelot_game::Variant;

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/daily", get(board).post(start))
}

#[derive(Debug, Deserialize)]
struct DayQuery {
    /// `today` (the default) or `yesterday`.
    day: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Row {
    rank: i64,
    name: String,
    score: i32,
}

/// The signed-in player's own attempt of the day: whether it is started, and its score once the round is over.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Mine {
    score: Option<i32>,
    rank: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Board {
    day: String,
    variant: Variant,
    today: bool,
    rows: Vec<Row>,
    mine: Option<Mine>,
}

fn today(state: &AppState) -> Date {
    state.clock.now().to_offset(UtcOffset::UTC).date()
}

/// The deal's key, or "not found" when the operator has not set one: there is no daily deal then.
fn secret(state: &AppState) -> Result<&str, AppError> {
    let secret = state.config.daily_deal_secret.trim();
    if secret.is_empty() {
        Err(AppError::NotFound)
    } else {
        Ok(secret)
    }
}

async fn board(
    State(state): State<AppState>,
    session: MaybeSession,
    Query(query): Query<DayQuery>,
) -> Result<Json<Board>, AppError> {
    secret(&state)?;
    let now = today(&state);
    let (day, is_today) = match query.day.as_deref() {
        None | Some("today") => (now, true),
        Some("yesterday") => (now.previous_day().ok_or(AppError::BadRequest)?, false),
        Some(_) => return Err(AppError::BadRequest),
    };
    let entries = daily::top(&state.pool, day).await?;
    let scores: Vec<i32> = entries.iter().map(|entry| entry.score).collect();
    let rows = entries
        .into_iter()
        .zip(ranks(&scores))
        .map(|(entry, rank)| Row {
            rank,
            name: entry.name,
            score: entry.score,
        })
        .collect();
    let mine = match session.account() {
        None => None,
        Some(account) => match daily::attempt(&state.pool, day, account).await? {
            None => None,
            Some(None) => Some(Mine {
                score: None,
                rank: None,
            }),
            Some(Some(score)) => Some(Mine {
                score: Some(score),
                rank: Some(daily::listed_above(&state.pool, day, score).await? + 1),
            }),
        },
    };
    Ok(Json(Board {
        day: day.to_string(),
        variant: variant_of(day),
        today: is_today,
        rows,
        mine,
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Started {
    table_id: Uuid,
    player_token: String,
    day: String,
    variant: Variant,
}

/// Opens today's table. A signed-in player has one attempt a day: a second is refused, even after leaving the first
/// unfinished. A guest may play it as often as they like, unranked.
async fn start(
    State(state): State<AppState>,
    session: MaybeSession,
) -> Result<(StatusCode, Json<Started>), AppError> {
    let seed = deal_seed(secret(&state)?, today(&state));
    let day = today(&state);
    let variant = variant_of(day);
    let account = session.account();
    if let Some(account) = account
        && !daily::claim(&state.pool, day, account).await?
    {
        return Err(AppError::conflict("daily-played", msg::DAILY_PLAYED));
    }
    let registry = state.registry.clone();
    let made = super::blocking(move || registry.create_daily(day, variant, seed, account)).await?;
    let access = match made {
        Ok(access) => access,
        Err(error) => {
            if let Some(account) = account {
                // The table could not be made: the attempt is given back.
                let _ = daily::release(&state.pool, day, account).await;
            }
            return Err(error);
        }
    };
    Ok((
        StatusCode::CREATED,
        Json(Started {
            table_id: access.table_id,
            player_token: access.player_token,
            day: day.to_string(),
            variant,
        }),
    ))
}
