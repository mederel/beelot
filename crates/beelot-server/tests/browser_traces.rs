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

/// The spans of a page that made a few calls: far over the 4 KiB of an ordinary request (US-189).
fn spans_body(count: usize) -> String {
    let span = r#"{"kind":"fetch","traceId":"0af7651916cd43dd8448eb211c80319c","spanId":"b7ad6b7169203331","method":"GET","route":"/api/tables/{id}/state","startMs":1000,"endMs":1050,"status":200,"failed":false,"platform":"web"}"#;
    format!(r#"{{"spans":[{}]}}"#, vec![span; count].join(","))
}

fn traced_state() -> beelot_server::app::AppState {
    use opentelemetry::trace::TracerProvider;
    beelot_server::browser_traces::install(
        opentelemetry_sdk::trace::SdkTracerProvider::builder()
            .build()
            .tracer("test"),
    );
    let config = beelot_server::config::Config {
        browser_traces: true,
        ..Default::default()
    };
    common::state_with(config).0
}

#[tokio::test]
async fn a_batch_of_fifty_spans_is_taken_although_it_is_over_the_global_limit() {
    let body = spans_body(50);
    assert!(body.len() > 4096);
    let app = router(traced_state());
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/telemetry/spans")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn seventy_kilobytes_of_spans_are_still_refused_with_traces_on() {
    let big = format!(r#"{{"spans":[],"padding":"{}"}}"#, "x".repeat(70_000));
    let app = router(traced_state());
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
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}
