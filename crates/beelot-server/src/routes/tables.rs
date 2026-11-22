//! Creating, joining and playing at tables: `/api/tables` and `/api/matchmaking/quick-match`.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use beelot_game::bot::hints::CardReason;
use beelot_game::bot::review::costly_cards;
use beelot_game::match_score::default_target;
use beelot_game::{Difficulty, Variant};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ApiJson, bearer, blocking, table_id};
use crate::api::Snapshot;
use crate::api::analysis::{AnalysisView, CostlyCardView};
use crate::app::AppState;
use crate::auth::MaybeSession;
use crate::error::AppError;
use crate::tables::registry::LocalOptions;
use crate::tables::{Access, Action, Hint};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/tables", post(create))
        .route("/api/tables/join", post(join))
        .route("/api/tables/watch", post(watch))
        .route("/api/matchmaking/quick-match", post(quick_match))
        .route("/api/tables/{id}", get(table))
        .route("/api/tables/{id}/actions", post(act))
        .route("/api/tables/{id}/stream-ticket", post(stream_ticket))
        .route("/api/tables/{id}/hint", get(hint))
        .route("/api/tables/{id}/analysis", get(analysis))
        .route("/api/tables/{id}/explanations", get(explanations))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum Kind {
    Local,
    Private,
}

/// `seats`, for pass-and-play only: the four seat names from North, empty or null for a bot.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRequest {
    kind: Kind,
    variant: Option<Variant>,
    difficulty: Option<Difficulty>,
    announcements: Option<bool>,
    /// Whether Contrée bids may name tout-atout and sans-atout; on when absent.
    all_trumps: Option<bool>,
    target: Option<i32>,
    seats: Option<Vec<Option<String>>>,
    #[serde(default)]
    player_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinRequest {
    #[serde(default)]
    code: String,
    #[serde(default)]
    player_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuickMatchRequest {
    variant: Option<Variant>,
    #[serde(default)]
    player_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AccessResponse {
    table_id: Uuid,
    player_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
}

fn created(access: Access) -> impl IntoResponse {
    (
        StatusCode::CREATED,
        Json(AccessResponse {
            table_id: access.table_id,
            player_token: access.player_token,
            code: access.code,
        }),
    )
}

async fn create(
    State(state): State<AppState>,
    session: MaybeSession,
    ApiJson(request): ApiJson<CreateRequest>,
) -> Result<impl IntoResponse, AppError> {
    let variant = request.variant.unwrap_or(Variant::Classic);
    let account = session.account();
    let registry = &state.registry;
    let access = match request.kind {
        Kind::Local => registry.create_local(
            variant,
            request.difficulty.unwrap_or(Difficulty::Relaxed),
            LocalOptions {
                announcements: request.announcements.unwrap_or(true),
                all_trumps: request.all_trumps.unwrap_or(true),
                target: request.target.unwrap_or_else(|| default_target(variant)),
            },
            request.seats,
            account,
        ),
        Kind::Private => registry.create_private(&request.player_name, variant, account),
    }?;
    Ok(created(access))
}

async fn join(
    State(state): State<AppState>,
    session: MaybeSession,
    ApiJson(request): ApiJson<JoinRequest>,
) -> Result<impl IntoResponse, AppError> {
    let account = session.account();
    let access = state
        .registry
        .join(&request.code, &request.player_name, account)
        .await?;
    Ok(created(access))
}

#[derive(Debug, Deserialize)]
struct WatchRequest {
    code: String,
}

/// Opens a table to watch with its invitation code (US-071): a token that reads and never acts.
async fn watch(
    State(state): State<AppState>,
    ApiJson(request): ApiJson<WatchRequest>,
) -> Result<impl IntoResponse, AppError> {
    let access = state.registry.watch(&request.code)?;
    Ok(created(access))
}

async fn quick_match(
    State(state): State<AppState>,
    session: MaybeSession,
    ApiJson(request): ApiJson<QuickMatchRequest>,
) -> Result<impl IntoResponse, AppError> {
    let account = session.account();
    let variant = request.variant.unwrap_or(Variant::Classic);
    // Quick matches wait for each other, and a fourth player's join may start a match with bots.
    let access = state
        .registry
        .quick_match(&request.player_name, variant, account)
        .await?;
    Ok(created(access))
}

async fn table(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Snapshot>, AppError> {
    let token = bearer(&headers)
        .ok_or_else(AppError::table_unauthorized)?
        .to_owned();
    let id = table_id(&id)?;
    let (handle, actor) = state.registry.authorize(id, &token)?;
    Ok(Json(handle.snapshot(actor, state.clock.now())?))
}

/// A single-use ticket, good for 30 seconds, that opens the table's event stream from a URL, so the player token is
/// never in one (`EventSource` cannot send a header).
async fn stream_ticket(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let token = bearer(&headers)
        .ok_or_else(AppError::table_unauthorized)?
        .to_owned();
    let id = table_id(&id)?;
    let ticket = state.registry.stream_ticket(id, &token)?;
    Ok(Json(serde_json::json!({ "ticket": ticket })))
}

/// Applies one action and answers the table as the player now sees it, off the async threads: the bots may search
/// before answering.
async fn act(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    ApiJson(action): ApiJson<Action>,
) -> Result<Json<Snapshot>, AppError> {
    let token = bearer(&headers)
        .ok_or_else(AppError::table_unauthorized)?
        .to_owned();
    let id = table_id(&id)?;
    let (handle, actor) = state.registry.authorize(id, &token)?;
    let (outcome, view) = state.registry.act(&handle, actor, action).await?;
    state.hand_over([outcome]);
    Ok(Json(view))
}

/// What the Challenging bot would do in the player's place (US-065). Searching takes a while, off the async threads.
async fn hint(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Hint>, AppError> {
    let token = bearer(&headers)
        .ok_or_else(AppError::table_unauthorized)?
        .to_owned();
    let id = table_id(&id)?;
    let (handle, _) = state.registry.authorize(id, &token)?;
    // The view is read at once; the search is the part that takes a while, off the async threads.
    let input = handle.published().hint_input()?;
    let _solving = state.solvers.enter()?;
    Ok(Json(blocking(move || input.solve()).await?))
}

/// The time the analysis of a round may take; the cards not examined by then are left out.
const ANALYSIS_BUDGET: std::time::Duration = std::time::Duration::from_secs(4);

/// The cards of the finished round that cost the player's team ten points or more, found by the solver (US-067).
/// Solving runs off the async threads and never holds the table, so the next round is never held up.
async fn analysis(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Arc<AnalysisView>>, AppError> {
    let token = bearer(&headers)
        .ok_or_else(AppError::table_unauthorized)?
        .to_owned();
    let id = table_id(&id)?;
    let (handle, _) = state.registry.authorize(id, &token)?;
    let published = handle.published();
    let input = published.review_input()?;
    // A finished round does not change: while the table's version is the same, the first answer is still the answer.
    if let Some(known) = handle.known_analysis(published.version) {
        return Ok(Json(known));
    }
    let _solving = state.solvers.enter()?;
    let found =
        blocking(move || costly_cards(&input.tricks, input.trump, input.seat, ANALYSIS_BUDGET))
            .await?;
    let view = Arc::new(AnalysisView {
        complete: found.complete,
        costly: found
            .costly
            .into_iter()
            .map(|card| CostlyCardView {
                trick: card.trick,
                position: card.position,
                played: card.played.into(),
                best: card.best.into(),
                points_lost: card.points_lost,
            })
            .collect(),
    });
    handle.keep_analysis(published.version, view.clone());
    Ok(Json(view))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExplanationView {
    trick: usize,
    position: usize,
    seat: usize,
    reason: CardReason,
}

/// Why the bots played the cards of the finished round (US-149): the hint engine's reason codes, which the client
/// translates. Cheap, unlike the analysis, so it is answered at once.
async fn explanations(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<ExplanationView>>, AppError> {
    let token = bearer(&headers)
        .ok_or_else(AppError::table_unauthorized)?
        .to_owned();
    let id = table_id(&id)?;
    let (handle, _) = state.registry.authorize(id, &token)?;
    let found = handle.published().review_input()?.explanations();
    Ok(Json(
        found
            .into_iter()
            .map(|found| ExplanationView {
                trick: found.trick,
                position: found.position,
                seat: found.seat,
                reason: found.reason,
            })
            .collect(),
    ))
}
