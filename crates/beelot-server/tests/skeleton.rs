mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use beelot_server::app::router;
use common::{body_bytes, body_json, test_state};
use tower::ServiceExt;

const SPA_PATHS: [&str; 16] = [
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
    "/leaderboard",
    "/friends/add/abc",
    "/privacy",
];

/// The files the build wrote under `/assets`, as paths: their names carry a hash of their content (US-191).
fn built_assets() -> Vec<String> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/static/assets");
    let mut paths: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|entry| format!("/assets/{}", entry.unwrap().file_name().to_str().unwrap()))
        .collect();
    paths.sort();
    paths
}

/// The path of a file `index.html` names after `marker`, for example `src="` or `href="`.
fn named_in_index(marker: &str, prefix: &str) -> String {
    let index =
        std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/static/index.html")).unwrap();
    let start = index.find(&format!("{marker}{prefix}")).unwrap() + marker.len();
    index[start..start + index[start..].find('"').unwrap()].to_string()
}

/// The page's script.
fn app_script() -> String {
    named_in_index("src=\"", "/assets/app-")
}

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
    let script = app_script();
    let response = get(&script).await;
    assert_eq!(response.status(), StatusCode::OK);
    let app = std::fs::read(format!("{}/static{script}", env!("CARGO_MANIFEST_DIR"))).unwrap();
    assert_eq!(body_bytes(response).await, app);

    let root = get("/").await;
    assert_eq!(root.status(), StatusCode::OK);
}

/// A request with the headers a browser sends.
async fn get_with(path: &str, accept_encoding: Option<&str>) -> axum::response::Response {
    let state = test_state();
    let mut request = Request::builder().uri(path);
    if let Some(encoding) = accept_encoding {
        request = request.header("accept-encoding", encoding);
    }
    router(state)
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn the_pages_own_files_are_gzipped_for_a_browser_that_accepts_it() {
    // US-208: a slow phone waits for the bytes, so the script, the style and the page go out compressed.
    let script = app_script();
    let plain = std::fs::read(format!("{}/static{script}", env!("CARGO_MANIFEST_DIR"))).unwrap();
    for path in [script.as_str(), "/", "/play/bot"] {
        let response = get_with(path, Some("gzip, br")).await;
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        assert_eq!(response.headers()["content-encoding"], "gzip", "{path}");
        let sent = body_bytes(response).await.len();
        assert!(sent < 120_000, "{path} is {sent} bytes");
    }
    let sent = body_bytes(get_with(&script, Some("gzip")).await)
        .await
        .len();
    assert!(
        sent * 2 < plain.len(),
        "{} bytes became {sent}",
        plain.len()
    );
}

#[tokio::test]
async fn a_browser_that_does_not_accept_gzip_gets_the_file_as_it_is() {
    let script = app_script();
    let plain = std::fs::read(format!("{}/static{script}", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let response = get_with(&script, None).await;
    assert!(response.headers().get("content-encoding").is_none());
    assert_eq!(body_bytes(response).await, plain);
}

#[tokio::test]
async fn the_api_is_never_compressed() {
    // Its answers carry tokens and echo what a player typed; the event stream must not be buffered either.
    for path in ["/api/account", "/api/nothing"] {
        let response = get_with(path, Some("gzip, br")).await;
        assert!(
            response.headers().get("content-encoding").is_none(),
            "{path}"
        );
    }
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
    for path in ["/", "/rules", "/api/health", "/api/nothing", &app_script()] {
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
async fn pages_and_files_that_keep_their_name_are_revalidated_on_every_load() {
    for path in [
        "/",
        "/rules",
        "/sw.js",
        "/privacy-policy.json",
        "/manifest.webmanifest",
        "/favicon.svg",
        "/icon-192.png",
        "/apple-touch-icon.png",
    ] {
        let response = get(path).await;
        assert_eq!(response.headers()["cache-control"], "no-cache", "{path}");
    }
}

const IMMUTABLE: &str = "public, max-age=31536000, immutable";

#[tokio::test]
async fn the_build_s_files_are_named_after_their_content_and_kept_for_a_year() {
    let assets = built_assets();
    assert!(assets.len() >= 8, "the build wrote its files: {assets:?}");
    for path in &assets {
        // `name-HASH.ext`: the hash is eight characters of letters, digits, `_` and `-`.
        let (stem, _) = path.rsplit_once('.').unwrap();
        let hash = &stem[stem.len() - 8..];
        assert!(
            stem.as_bytes()[stem.len() - 9] == b'-'
                && hash
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'),
            "{path} carries a hash"
        );
        let response = get(path).await;
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        assert_eq!(response.headers()["cache-control"], IMMUTABLE, "{path}");
    }
    // The page names its script and its stylesheet by those names.
    for (marker, prefix) in [("src=\"", "/assets/app-"), ("href=\"", "/assets/style-")] {
        let path = named_in_index(marker, prefix);
        assert!(assets.contains(&path), "{path} is built");
    }
}

#[tokio::test]
async fn a_missing_file_under_assets_is_never_kept() {
    for path in ["/assets/app-AAAAAAAA.js", "/assets/nothing.css", "/assets/"] {
        let response = get(path).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{path}");
        assert_eq!(response.headers()["cache-control"], "no-cache", "{path}");
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

#[tokio::test]
async fn the_version_is_public_and_a_dev_build_has_no_release_link() {
    let response = get("/api/version").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "public, max-age=300");
    // Tests are not built by the release workflow, which alone sets BEELOT_VERSION.
    assert_eq!(
        body_json(response).await,
        serde_json::json!({"version": "dev", "releaseUrl": null, "browserTraces": false})
    );
}

#[tokio::test]
async fn the_asset_links_file_names_the_android_app_once_its_certificate_is_known() {
    let response = get("/.well-known/assetlinks.json").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_json(response).await, serde_json::json!([]));

    let fingerprint = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
    let config = beelot_server::config::Config {
        android_cert_sha256: vec![fingerprint.into()],
        ..Default::default()
    };
    let (state, _clock) = common::state_with(config);
    let response = router(state)
        .oneshot(
            Request::get("/.well-known/assetlinks.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body[0]["target"]["package_name"], "fr.beelot.app");
    assert_eq!(
        body[0]["target"]["sha256_cert_fingerprints"][0],
        fingerprint
    );
}

#[test]
fn the_gradient_text_has_no_text_stroke() {
    // A text stroke is painted over a `background-clip: text` gradient on Android Chrome (paint-order is ignored),
    // which eats the glyphs of the home headline. The gradient text must have no stroke.
    let stylesheet = named_in_index("href=\"", "/assets/style-");
    let css = std::fs::read_to_string(format!("{}/static{stylesheet}", env!("CARGO_MANIFEST_DIR")))
        .unwrap();
    let rule = css
        .split(".text-gradient{")
        .nth(1)
        .and_then(|rest| rest.split('}').next())
        .expect("the gradient text rule exists");
    assert!(rule.contains("background-clip:text"), "{rule}");
    assert!(!rule.contains("text-stroke"), "{rule}");
}
