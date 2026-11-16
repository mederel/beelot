//! The browser's spans (US-158): off unless the operator turned them on and the server exports traces.

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use beelot_server::app::router;
use common::{body_json, test_state};
use tower::ServiceExt;

fn spans(body: &'static str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/telemetry/spans")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap()
}

#[tokio::test]
async fn the_route_does_not_exist_while_the_browser_traces_are_off() {
    let app = router(test_state());
    let response = app.oneshot(spans(r#"{"spans":[]}"#)).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn the_client_is_told_not_to_load_its_tracing_script() {
    let app = router(test_state());
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/version")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_json(response).await["browserTraces"], false);
}

#[tokio::test]
async fn a_body_over_sixty_four_kib_is_refused() {
    let app = router(test_state());
    let big = format!(r#"{{"spans":[],"padding":"{}"}}"#, "x".repeat(70_000));
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/telemetry/spans")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(big))
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(
        matches!(
            response.status(),
            StatusCode::PAYLOAD_TOO_LARGE | StatusCode::NOT_FOUND
        ),
        "{}",
        response.status()
    );
}
