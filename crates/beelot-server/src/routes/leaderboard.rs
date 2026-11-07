//! `GET /api/leaderboard`: the best-rated players of a variant, and the signed-in player's own place.
//! `GET` and `PUT /api/leaderboard/visibility`: whether the signed-in player is hidden from it (US-069).

use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use super::ApiJson;
use crate::app::AppState;
use crate::auth::MaybeSession;
use crate::db::ratings::{self, LEADERBOARD_SIZE, MIN_MATCHES};
use crate::error::AppError;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/leaderboard", get(leaderboard))
        .route(
            "/api/leaderboard/visibility",
            get(visibility).put(set_visibility),
        )
}

#[derive(Debug, Deserialize)]
struct VariantQuery {
    variant: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Row {
    rank: i64,
    name: String,
    rating: i32,
    matches: i32,
}

/// The signed-in player's own place: a rank once they are listed, and why not before.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Mine {
    rating: i32,
    matches: i32,
    hidden: bool,
    rank: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Leaderboard {
    variant: String,
    size: i64,
    min_matches: i32,
    rows: Vec<Row>,
    mine: Option<Mine>,
}

async fn leaderboard(
    State(state): State<AppState>,
    session: MaybeSession,
    Query(query): Query<VariantQuery>,
) -> Result<Json<Leaderboard>, AppError> {
    let variant = match query.variant.as_deref() {
        None | Some("CLASSIC") => "CLASSIC",
        Some("CONTREE") => "CONTREE",
        Some(_) => return Err(AppError::BadRequest),
    };
    let entries = ratings::top(&state.pool, variant).await?;
    let mut rows: Vec<Row> = Vec::with_capacity(entries.len());
    for (index, entry) in entries.iter().enumerate() {
        // Equal ratings share a rank.
        let rank = match (
            index.checked_sub(1).map(|previous| &entries[previous]),
            rows.last(),
        ) {
            (Some(previous), Some(row)) if previous.rating == entry.rating => row.rank,
            _ => index as i64 + 1,
        };
        rows.push(Row {
            rank,
            name: entry.name.clone(),
            rating: entry.rating.round() as i32,
            matches: entry.matches,
        });
    }
    let mut mine = None;
    if let Some(account) = session.account()
        && let Some(own) = ratings::of_variant(&state.pool, account, variant).await?
    {
        let hidden = ratings::is_hidden(&state.pool, account).await?;
        let listed = !hidden && own.matches >= MIN_MATCHES;
        let rank = if listed {
            Some(ratings::listed_above(&state.pool, variant, own.glicko.rating).await? + 1)
        } else {
            None
        };
        mine = Some(Mine {
            rating: own.glicko.rating.round() as i32,
            matches: own.matches,
            hidden,
            rank,
        });
    }
    Ok(Json(Leaderboard {
        variant: variant.to_string(),
        size: LEADERBOARD_SIZE,
        min_matches: MIN_MATCHES,
        rows,
        mine,
    }))
}

#[derive(Debug, Serialize, Deserialize)]
struct Visibility {
    hidden: bool,
}

fn signed_in(session: &MaybeSession) -> Result<uuid::Uuid, AppError> {
    session.account().ok_or(AppError::Unauthorized {
        code: "sign-in-required",
        message: "Sign in to choose whether you appear on the leaderboard.",
    })
}

async fn visibility(
    State(state): State<AppState>,
    session: MaybeSession,
) -> Result<Json<Visibility>, AppError> {
    let account = signed_in(&session)?;
    Ok(Json(Visibility {
        hidden: ratings::is_hidden(&state.pool, account).await?,
    }))
}

async fn set_visibility(
    State(state): State<AppState>,
    session: MaybeSession,
    ApiJson(body): ApiJson<Visibility>,
) -> Result<Json<Visibility>, AppError> {
    let account = signed_in(&session)?;
    ratings::set_hidden(&state.pool, account, body.hidden).await?;
    Ok(Json(body))
}
