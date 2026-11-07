//! `GET /api/statistics`: the signed-in player's own statistics; guests are asked to sign in.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use time::OffsetDateTime;

use crate::app::AppState;
use crate::auth::MaybeSession;
use crate::db::{matches, ratings};
use crate::error::AppError;
use crate::history::statistics::{self, PlayerStatistics};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/statistics", get(statistics))
        .route("/api/ratings", get(player_ratings))
}

async fn statistics(
    State(state): State<AppState>,
    session: MaybeSession,
) -> Result<Json<PlayerStatistics>, AppError> {
    let account = session.account().ok_or(AppError::Unauthorized {
        code: "sign-in-required",
        message: "Sign in to see your statistics.",
    })?;
    let played = matches::played_by(&state.pool, account).await?;
    Ok(Json(statistics::of(account, &played)))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RatingPoint {
    #[serde(with = "time::serde::rfc3339")]
    rated_at: OffsetDateTime,
    rating: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VariantRating {
    variant: String,
    rating: i32,
    deviation: i32,
    matches: i32,
    history: Vec<RatingPoint>,
}

#[derive(Debug, Serialize)]
struct Ratings {
    ratings: Vec<VariantRating>,
}

/// `GET /api/ratings`: the signed-in player's Glicko-2 rating in each variant, with how it changed.
async fn player_ratings(
    State(state): State<AppState>,
    session: MaybeSession,
) -> Result<Json<Ratings>, AppError> {
    let account = session.account().ok_or(AppError::Unauthorized {
        code: "sign-in-required",
        message: "Sign in to see your rating.",
    })?;
    let current = ratings::of(&state.pool, account).await?;
    let history = ratings::history(&state.pool, account).await?;
    let ratings = current
        .into_iter()
        .map(|stored| VariantRating {
            rating: stored.glicko.rating.round() as i32,
            deviation: stored.glicko.deviation.round() as i32,
            matches: stored.matches,
            history: history
                .iter()
                .filter(|point| point.variant == stored.variant)
                .map(|point| RatingPoint {
                    rated_at: point.rated_at,
                    rating: point.rating.round() as i32,
                })
                .collect(),
            variant: stored.variant,
        })
        .collect();
    Ok(Json(Ratings { ratings }))
}
