//! The page of an invite link carries the tags of a rich preview (US-212).

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use beelot_server::app::router;
use common::{body_bytes, test_state};
use tower::ServiceExt;

async fn get(path: &str, language: Option<&str>) -> axum::http::Response<Body> {
    let mut request = Request::builder().uri(path);
    if let Some(language) = language {
        request = request.header("accept-language", language);
    }
    router(test_state())
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

async fn html(path: &str, language: Option<&str>) -> String {
    let response = get(path, language).await;
    assert_eq!(response.status(), StatusCode::OK, "{path}");
    assert!(
        response.headers()["content-type"]
            .to_str()
            .unwrap()
            .starts_with("text/html")
    );
    String::from_utf8(body_bytes(response).await).unwrap()
}

fn index() -> String {
    std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/static/index.html")).unwrap()
}

#[tokio::test]
async fn a_link_with_a_code_carries_the_preview_in_english_by_default() {
    let page = html("/join/ABC234", None).await;
    for expected in [
        r#"<meta property="og:type" content="website">"#,
        r#"<meta property="og:title" content="Join my belote table on Beelot">"#,
        r#"<meta property="og:url" content="http://localhost:8080/join/ABC234">"#,
        r#"<meta property="og:image" content="http://localhost:8080/og-image.png">"#,
        r#"<meta property="og:image:width" content="1200">"#,
        r#"<meta property="og:image:height" content="630">"#,
        r#"<meta property="og:locale" content="en_US">"#,
        r#"<meta name="twitter:card" content="summary_large_image">"#,
        r#"<meta name="robots" content="noindex">"#,
    ] {
        assert!(page.contains(expected), "{expected}");
    }
    let head = &page[..page.find("</head>").unwrap()];
    assert!(head.contains("og:title"), "the tags are in the head");
    assert!(
        page.contains("<div id=\"app\"></div>"),
        "the page is still the app's"
    );
}

#[tokio::test]
async fn the_preview_speaks_the_language_of_the_visitor() {
    let french = html("/join/ABC234", Some("fr-FR,fr;q=0.9,en;q=0.5")).await;
    assert!(french.contains("Rejoignez ma table de belote sur Beelot"));
    assert!(french.contains(r#"content="fr_FR""#));
    let dutch = html("/join/ABC234", Some("nl")).await;
    assert!(dutch.contains("Kom aan mijn belote-tafel op Beelot"));
    assert!(dutch.contains(r#"content="nl_NL""#));
    let other = html("/join/ABC234", Some("de")).await;
    assert!(other.contains("Join my belote table on Beelot"));
}

#[tokio::test]
async fn a_lowercase_code_is_written_in_upper_case() {
    let page = html("/join/abc234", None).await;
    assert!(page.contains("/join/ABC234\""));
    assert!(!page.contains("/join/abc234"));
}

#[tokio::test]
async fn what_is_not_a_code_gets_the_plain_page() {
    for path in [
        "/join/ABC23",
        "/join/ABC2345",
        "/join/ABCO01",
        "/join/%3Cscript%3E",
        "/join/%22%3E%3Cb%3E12",
    ] {
        assert_eq!(html(path, None).await, index(), "{path}");
    }
}

#[tokio::test]
async fn the_preview_image_is_served_with_its_size() {
    let response = get("/og-image.png", None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "image/png");
    let bytes = body_bytes(response).await;
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    assert_eq!(u32::from_be_bytes(bytes[16..20].try_into().unwrap()), 1200);
    assert_eq!(u32::from_be_bytes(bytes[20..24].try_into().unwrap()), 630);
}
