//! The cookies the server sets, as a browser sees them (US-178): over HTTPS every one is `Secure` and the CSRF cookie has
//! its `__Host-` name beside the plain one for one release; over HTTP none is. No database: guests and ceremony options.

mod common;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, Response, header};
use beelot_server::app::router;
use beelot_server::config::Config;
use common::state_with;
use tower::ServiceExt;

fn app(public_url: &str) -> Router {
    let (state, _) = state_with(Config {
        public_url: public_url.into(),
        ..Config::default()
    });
    router(state)
}

fn set_cookies(response: &Response<Body>) -> Vec<String> {
    response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|value| value.to_str().unwrap().to_owned())
        .collect()
}

fn named<'a>(cookies: &'a [String], name: &str) -> Option<&'a String> {
    cookies
        .iter()
        .find(|cookie| cookie.starts_with(&format!("{name}=")))
}

async fn first_visit(public_url: &str) -> Vec<String> {
    let response = app(public_url)
        .oneshot(Request::get("/api/account").body(Body::empty()).unwrap())
        .await
        .unwrap();
    set_cookies(&response)
}

async fn ceremony(public_url: &str, cookie: &str) -> Response<Body> {
    app(public_url)
        .oneshot(
            Request::post("/api/passkeys/sign-in/options")
                .header(header::COOKIE, cookie)
                .header("x-xsrf-token", "token")
                .header("x-forwarded-for", "203.0.113.7")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
}

#[tokio::test]
async fn over_https_a_first_visit_gets_the_csrf_token_under_both_names_and_secure() {
    let cookies = first_visit("https://beelot.example").await;
    let prefixed = named(&cookies, "__Host-XSRF-TOKEN").expect("the prefixed cookie");
    let plain = named(&cookies, "XSRF-TOKEN").expect("the plain cookie, for one release");
    for cookie in [prefixed, plain] {
        assert!(
            cookie.ends_with("; SameSite=Lax; Path=/; Secure"),
            "{cookie}"
        );
        assert!(!cookie.contains("HttpOnly"), "the client reads it");
        assert!(!cookie.contains("Domain"), "{cookie}");
    }
    let value = |cookie: &String| {
        cookie
            .split(';')
            .next()
            .unwrap()
            .split_once('=')
            .unwrap()
            .1
            .to_owned()
    };
    assert_eq!(value(prefixed), value(plain));
}

#[tokio::test]
async fn over_http_the_csrf_token_is_the_plain_cookie_alone() {
    let cookies = first_visit("http://localhost:8080").await;
    assert_eq!(cookies.len(), 1);
    assert!(cookies[0].starts_with("XSRF-TOKEN="));
    assert!(!cookies[0].contains("Secure"));
}

#[tokio::test]
async fn a_client_with_the_prefixed_token_is_given_none() {
    let response = app("https://beelot.example")
        .oneshot(
            Request::get("/api/account")
                .header(header::COOKIE, "__Host-XSRF-TOKEN=abc")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(set_cookies(&response).is_empty());
}

#[tokio::test]
async fn a_page_opened_before_the_update_is_given_the_prefixed_token() {
    let response = app("https://beelot.example")
        .oneshot(
            Request::get("/api/account")
                .header(header::COOKIE, "XSRF-TOKEN=abc")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(named(&set_cookies(&response), "__Host-XSRF-TOKEN").is_some());
}

#[tokio::test]
async fn the_csrf_rule_accepts_either_name_and_refuses_a_wrong_token() {
    for cookie in ["__Host-XSRF-TOKEN=token", "XSRF-TOKEN=token"] {
        let response = ceremony("https://beelot.example", cookie).await;
        assert_eq!(response.status(), 200, "{cookie}");
    }
    let response = ceremony("https://beelot.example", "__Host-XSRF-TOKEN=other").await;
    assert_eq!(response.status(), 403);
}

#[tokio::test]
async fn the_ceremony_cookie_is_secure_over_https_only() {
    let https = ceremony("https://beelot.example", "XSRF-TOKEN=token").await;
    let cookies = set_cookies(&https);
    let cookie = named(&cookies, "BEELOT_CEREMONY").expect("a ceremony cookie");
    assert!(cookie.ends_with("; Max-Age=300; Secure"), "{cookie}");
    let http = ceremony("http://localhost:8080", "XSRF-TOKEN=token").await;
    let cookies = set_cookies(&http);
    let cookie = named(&cookies, "BEELOT_CEREMONY").expect("a ceremony cookie");
    assert!(!cookie.contains("Secure"), "{cookie}");
}
