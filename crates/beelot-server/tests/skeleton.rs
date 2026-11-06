mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use beelot_server::app::router;
use common::{body_bytes, body_json, test_state};
use tower::ServiceExt;

const SPA_PATHS: [&str; 14] = [
    "/play/bot",
    "/play/local",
    "/play/bot/bidding/123",
    "/play/bot/game/123",
    "/online/private",
    "/online/private/new",
    "/online/private/table/abc",
    "/online/public",
    "/online/public/table/abc",
    "/tutorial",
    "/rules",
    "/settings",
    "/stats",
    "/privacy",
];

async fn get(path: &str) -> axum::http::Response<Body> {
    router(test_state())
        .oneshot(Request::get(path).body(Body::empty()).unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn serves_index_for_spa_paths() {
    let index = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/static/index.html")).unwrap();
    for path in SPA_PATHS {
        let response = get(path).await;
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        assert!(
            response.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with("text/html"),
            "{path}"
        );
        assert_eq!(body_bytes(response).await, index, "{path}");
    }
}

#[tokio::test]
async fn serves_static_assets() {
    let response = get("/app.js").await;
    assert_eq!(response.status(), StatusCode::OK);
    let app = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/static/app.js")).unwrap();
    assert_eq!(body_bytes(response).await, app);

    let root = get("/").await;
    assert_eq!(root.status(), StatusCode::OK);
}

#[tokio::test]
async fn unknown_path_is_404() {
    for path in [
        "/nowhere",
        "/play/bot/extra/1/2",
        "/online/private/table",
        "/api/nothing",
    ] {
        assert_eq!(get(path).await.status(), StatusCode::NOT_FOUND, "{path}");
    }
}

#[tokio::test]
async fn every_response_has_no_referrer_policy() {
    for path in ["/", "/app.js", "/rules", "/nowhere", "/api/nothing"] {
        let response = get(path).await;
        assert_eq!(
            response.headers()["referrer-policy"],
            "no-referrer",
            "{path}"
        );
    }
}

#[tokio::test]
async fn error_bodies_have_code_and_message() {
    let response = get("/api/nothing").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = body_json(response).await;
    assert_eq!(body["error"], "not-found");
    assert!(body["message"].is_string());
}

#[tokio::test]
async fn oversized_headers_are_refused() {
    let response = router(test_state())
        .oneshot(
            Request::get("/rules")
                .header("x-padding", "a".repeat(9 * 1024))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::REQUEST_HEADER_FIELDS_TOO_LARGE
    );
}

#[tokio::test]
async fn every_response_carries_the_security_headers() {
    for path in ["/", "/rules", "/api/health", "/api/nothing", "/app.js"] {
        let response = get(path).await;
        let headers = response.headers();
        let csp = headers["content-security-policy"].to_str().unwrap();
        for part in [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
        ] {
            assert!(csp.contains(part), "{path}: {part}");
        }
        assert!(!csp.contains("unsafe-inline"), "{path}");
        assert_eq!(headers["x-content-type-options"], "nosniff", "{path}");
        assert_eq!(headers["x-frame-options"], "DENY", "{path}");
        assert_eq!(headers["referrer-policy"], "no-referrer", "{path}");
        assert!(headers.contains_key("permissions-policy"), "{path}");
    }
}

#[tokio::test]
async fn hsts_is_sent_only_when_players_use_https() {
    assert!(
        !get("/rules")
            .await
            .headers()
            .contains_key("strict-transport-security")
    );
    let config = beelot_server::config::Config {
        public_url: "https://beelot.example".into(),
        ..Default::default()
    };
    let (state, _clock) = common::state_with(config);
    let response = router(state)
        .oneshot(Request::get("/rules").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(
        response.headers()["strict-transport-security"],
        "max-age=31536000"
    );
}
