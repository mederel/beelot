//! `GET /api/health` (US-151): ok with a database, unavailable without, and never an error text.

mod common;
#[path = "common/db.rs"]
mod db;

use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use beelot_server::app::{AppState, router};
use common::{body_bytes, test_state};
use sqlx::mysql::MySqlPoolOptions;
use tower::ServiceExt;

async fn get_health(state: AppState) -> (StatusCode, String) {
    let response = router(state)
        .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let body = String::from_utf8(body_bytes(response).await).unwrap();
    (status, body)
}

#[tokio::test]
async fn the_server_is_ok_when_it_reaches_its_database() {
    let state = test_state().with_pool(db::test_pool().await);
    let (status, body) = get_health(state).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, r#"{"status":"ok"}"#);
}

#[tokio::test]
async fn the_server_is_unavailable_without_a_database_and_says_nothing_more() {
    // Nothing listens on port 1.
    let pool = MySqlPoolOptions::new()
        .acquire_timeout(Duration::from_secs(1))
        .connect_lazy("mysql://root@127.0.0.1:1/beelot")
        .unwrap();
    let (status, body) = get_health(test_state().with_pool(pool)).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body, r#"{"status":"unavailable"}"#);
    for leak in ["error", "refused", "127.0.0.1", "mysql", "sqlx"] {
        assert!(!body.contains(leak), "the answer leaks {leak}");
    }
}
