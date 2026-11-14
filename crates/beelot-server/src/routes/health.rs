//! `GET /api/health`: whether the server can reach its database (US-151). For a container, a proxy or a monitor: it needs no
//! sign-in, says nothing but `ok` or `unavailable`, reads nothing of the tables and writes nothing.

use std::time::Duration;

use axum::extract::State;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use crate::app::AppState;

/// How long the database may take to answer before the server is called unavailable.
const DATABASE_WAIT: Duration = Duration::from_secs(2);

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/health", get(health))
}

/// Whether the database answers within the wait. Shared with the operator's status page (US-152).
pub async fn database_reachable(pool: &sqlx::MySqlPool) -> bool {
    matches!(
        tokio::time::timeout(DATABASE_WAIT, sqlx::query("SELECT 1").execute(pool)).await,
        Ok(Ok(_))
    )
}

/// Never cached, and never an error text: whatever went wrong, the answer is the same short word.
async fn health(State(state): State<AppState>) -> Response {
    let (status, word) = if database_reachable(&state.pool).await {
        (StatusCode::OK, "ok")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "unavailable")
    };
    let mut response = (status, Json(json!({ "status": word }))).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
