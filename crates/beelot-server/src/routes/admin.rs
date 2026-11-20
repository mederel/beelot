//! The operator's status page, `/admin/status` (US-152). It is off unless `BEELOT_ADMIN_TOKEN` is set; with it set, the
//! page needs the token, given as a bearer token or through the sign-in form, which sets a short cookie. Everything it
//! shows is counted or fixed: no names, tokens or addresses. It is read-only and needs no script.

use std::time::Duration;

use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Form, Router};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use sha2::Sha256;
use time::format_description::well_known::Rfc3339;

use crate::app::AppState;
use crate::auth::csrf::equal;
use crate::auth::sessions::cookie_value;
use crate::error::AppError;
use crate::logs::LogEntry;
use crate::routes::bearer;
use crate::routes::health::database_reachable;
use crate::routes::version::VERSION;
use crate::tables::TableKind;

/// The shortest token the operator may set; the server refuses to start with a shorter one.
pub const MIN_TOKEN_CHARS: usize = 16;

const PAGE: &str = "/admin/status";
const LOGIN: &str = "/admin/login";
const COOKIE: &str = "beelot_admin";
/// Half an hour: a short sign-in for the operator's screen, not a session.
const COOKIE_MAX_AGE: u32 = 1800;
/// What the cookie's HMAC signs, with the expiry: the cookie reveals nothing of the token.
const COOKIE_MESSAGE: &str = "beelot-admin-status";

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(PAGE, get(status))
        .route(LOGIN, post(login))
}

/// The operator's token, or `None` when the page is off.
pub fn configured_token(state: &AppState) -> Option<&str> {
    let token = state.config.admin_token.trim();
    (!token.is_empty()).then_some(token)
}

/// The HMAC, keyed by the token, of the message and the expiry: the token itself never reaches the browser.
fn signature(token: &str, expires: i64) -> String {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(token.as_bytes()).expect("HMAC accepts a key of any length");
    mac.update(format!("{COOKIE_MESSAGE}:{expires}").as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

/// The value of the admin cookie for `token`, good until `expires` (Unix seconds): the server enforces it, so a
/// stolen cookie stops working with the half hour, whatever the browser does with `Max-Age`.
fn cookie_value_for(token: &str, expires: i64) -> String {
    format!("{expires}.{}", signature(token, expires))
}

/// Whether the cookie value is signed with `token` and still good at `now` (Unix seconds).
fn cookie_valid(token: &str, given: &str, now: i64) -> bool {
    let Some((expires, _)) = given.split_once('.') else {
        return false;
    };
    let Ok(expires) = expires.parse::<i64>() else {
        return false;
    };
    equal(
        given.as_bytes(),
        cookie_value_for(token, expires).as_bytes(),
    ) && now < expires
}

/// Whether the request carries the token, as a bearer token or as an admin cookie that has not expired.
fn authorized(token: &str, headers: &HeaderMap, now: i64) -> bool {
    let by_bearer = bearer(headers).is_some_and(|given| equal(given.as_bytes(), token.as_bytes()));
    let by_cookie =
        cookie_value(headers, COOKIE).is_some_and(|given| cookie_valid(token, given, now));
    by_bearer || by_cookie
}

/// Pages of this kind are never stored, so a shared browser or proxy does not keep the operator's figures.
fn no_store(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// The sign-in form: it shows no figure, only the field for the token.
fn sign_in(status: StatusCode, notice: &str) -> Response {
    let body = format!(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\
         <meta name=\"robots\" content=\"noindex\"><title>Beelot status: sign in</title></head>\
         <body><main><h1>Beelot status</h1><p>{notice}</p>\
         <form method=\"post\" action=\"{LOGIN}\">\
         <label for=\"token\">Operator token</label> \
         <input id=\"token\" name=\"token\" type=\"password\" autocomplete=\"off\" required> \
         <button type=\"submit\">Sign in</button></form></main></body></html>"
    );
    no_store((status, axum::response::Html(body)).into_response())
}

/// What the page shows, read when the page is asked for.
struct Report {
    version: &'static str,
    uptime: Duration,
    database: bool,
    tables: [(TableKind, usize); 3],
    players: usize,
    errors: Vec<LogEntry>,
}

async fn report(state: &AppState) -> Report {
    Report {
        version: VERSION,
        uptime: state.started.elapsed(),
        database: database_reachable(&state.pool).await,
        tables: state.registry.kind_counts(),
        players: state.registry.connected_players(),
        errors: state.errors.recent(),
    }
}

fn kind_label(kind: TableKind) -> &'static str {
    match kind {
        TableKind::Local => "Local (pass and play)",
        TableKind::Private => "Private",
        TableKind::Public => "Public",
    }
}

/// Text in the page: the figures are ours, but the log messages are escaped all the same.
fn escape(text: &str) -> String {
    text.chars()
        .flat_map(|character| match character {
            '&' => "&amp;".chars().collect::<Vec<_>>(),
            '<' => "&lt;".chars().collect(),
            '>' => "&gt;".chars().collect(),
            '"' => "&quot;".chars().collect(),
            '\'' => "&#39;".chars().collect(),
            other => vec![other],
        })
        .collect()
}

fn uptime_text(uptime: Duration) -> String {
    let seconds = uptime.as_secs();
    format!(
        "{} h {:02} min {:02} s",
        seconds / 3600,
        (seconds % 3600) / 60,
        seconds % 60
    )
}

fn render(report: &Report) -> String {
    let database = if report.database { "ok" } else { "unavailable" };
    let tables: String = report
        .tables
        .iter()
        .map(|(kind, count)| format!("<li>{}: {count}</li>", kind_label(*kind)))
        .collect();
    let errors: String = report
        .errors
        .iter()
        .map(|entry| {
            format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td></tr>",
                entry.at.format(&Rfc3339).unwrap_or_default(),
                entry.level.as_str(),
                escape(&entry.message)
            )
        })
        .collect();
    let errors = if errors.is_empty() {
        "<p>No warnings or errors recorded since the server started.</p>".to_owned()
    } else {
        format!(
            "<table><thead><tr><th scope=\"col\">Time (UTC)</th><th scope=\"col\">Level</th>\
             <th scope=\"col\">Message</th></tr></thead><tbody>{errors}</tbody></table>"
        )
    };
    format!(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\
         <meta name=\"robots\" content=\"noindex\"><title>Beelot status</title></head>\
         <body><main><h1>Beelot status</h1>\
         <dl><dt>Version</dt><dd>{version}</dd>\
         <dt>Running for</dt><dd>{uptime}</dd>\
         <dt>Database</dt><dd>{database}</dd></dl>\
         <h2>Open tables</h2><ul>{tables}</ul>\
         <p>Connected players: {players}</p>\
         <h2>Recent warnings and errors</h2>{errors}\
         </main></body></html>",
        version = escape(report.version),
        uptime = uptime_text(report.uptime),
        players = report.players,
    )
}

async fn status(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, AppError> {
    let Some(token) = configured_token(&state) else {
        return Err(AppError::NotFound);
    };
    if !authorized(token, &headers, state.clock.now().unix_timestamp()) {
        return Ok(sign_in(StatusCode::OK, ""));
    }
    let page = render(&report(&state).await);
    Ok(no_store(
        (StatusCode::OK, axum::response::Html(page)).into_response(),
    ))
}

#[derive(Deserialize)]
struct LoginForm {
    token: String,
}

async fn login(
    State(state): State<AppState>,
    Form(form): Form<LoginForm>,
) -> Result<Response, AppError> {
    let Some(token) = configured_token(&state) else {
        return Err(AppError::NotFound);
    };
    if !equal(form.token.trim().as_bytes(), token.as_bytes()) {
        return Ok(sign_in(StatusCode::UNAUTHORIZED, "The token is not right."));
    }
    let secure = if state.secure_cookies() {
        "; Secure"
    } else {
        ""
    };
    let cookie = format!(
        "{COOKIE}={}; Path=/admin; Max-Age={COOKIE_MAX_AGE}; HttpOnly; SameSite=Strict{secure}",
        cookie_value_for(
            token,
            state.clock.now().unix_timestamp() + i64::from(COOKIE_MAX_AGE)
        )
    );
    let mut response = Redirect::to(PAGE).into_response();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().append(header::SET_COOKIE, value);
    }
    Ok(no_store(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cookie_is_stable_for_a_token_and_differs_between_tokens() {
        assert_eq!(
            cookie_value_for("a-long-operator-token", 1000),
            cookie_value_for("a-long-operator-token", 1000)
        );
        assert_ne!(
            cookie_value_for("a-long-operator-token", 1000),
            cookie_value_for("another-operator-token", 1000)
        );
        assert!(!cookie_value_for("a-long-operator-token", 1000).contains("a-long-operator-token"));
    }

    #[test]
    fn a_cookie_is_valid_until_its_expiry_and_cannot_be_extended() {
        let cookie = cookie_value_for("a-long-operator-token", 1000);
        assert!(cookie_valid("a-long-operator-token", &cookie, 999));
        assert!(!cookie_valid("a-long-operator-token", &cookie, 1000));
        assert!(!cookie_valid("another-operator-token", &cookie, 999));
        // Changing the expiry without the token breaks the signature.
        let (_, signature) = cookie.split_once('.').unwrap();
        assert!(!cookie_valid(
            "a-long-operator-token",
            &format!("9999.{signature}"),
            999
        ));
        assert!(!cookie_valid("a-long-operator-token", "garbage", 999));
    }

    #[test]
    fn the_figures_are_escaped() {
        assert_eq!(
            escape("<script>\"x\" & 'y'</script>"),
            "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;"
        );
    }

    #[test]
    fn uptime_reads_hours_minutes_and_seconds() {
        assert_eq!(
            uptime_text(Duration::from_secs(3 * 3600 + 5 * 60 + 7)),
            "3 h 05 min 07 s"
        );
    }

    #[tokio::test]
    async fn a_blank_token_switches_the_page_off() {
        let config = crate::config::Config {
            admin_token: "   ".into(),
            ..crate::config::Config::default()
        };
        let state = AppState::new(config, std::sync::Arc::new(crate::clock::SystemClock));
        assert!(configured_token(&state).is_none());
    }
}

#[cfg(test)]
mod router_tests {
    use std::sync::Arc;

    use axum::body::Body;
    use axum::http::{Method, Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::*;
    use crate::app::{AppState, router};
    use crate::clock::SystemClock;
    use crate::config::Config;

    const TOKEN: &str = "operator-token-0123";

    fn app(token: Option<&str>) -> axum::Router {
        let config = Config::from_vars(|name| match (name, token) {
            ("BEELOT_ADMIN_TOKEN", Some(token)) => Some(token.to_owned()),
            _ => None,
        })
        .expect("a valid configuration");
        router(AppState::new(config, Arc::new(SystemClock)))
    }

    async fn send(app: &axum::Router, request: Request<Body>) -> (StatusCode, HeaderMap, String) {
        let response = app.clone().oneshot(request).await.expect("a response");
        let status = response.status();
        let headers = response.headers().clone();
        let body = response
            .into_body()
            .collect()
            .await
            .expect("a body")
            .to_bytes();
        (status, headers, String::from_utf8_lossy(&body).into_owned())
    }

    fn get_page(bearer: Option<&str>) -> Request<Body> {
        let mut builder = Request::builder().method(Method::GET).uri(PAGE);
        if let Some(token) = bearer {
            builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
        }
        builder.body(Body::empty()).expect("a request")
    }

    #[tokio::test]
    async fn the_page_is_off_without_a_token() {
        let app = app(None);
        let (status, _, _) = send(&app, get_page(Some(TOKEN))).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        let login = Request::builder()
            .method(Method::POST)
            .uri(LOGIN)
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(Body::from("token=anything"))
            .expect("a request");
        let (status, _, _) = send(&app, login).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn without_the_token_only_the_sign_in_form_is_shown() {
        let app = app(Some(TOKEN));
        let (status, headers, body) = send(&app, get_page(None)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Operator token"));
        assert!(!body.contains("Running for"));
        assert_eq!(headers[header::CACHE_CONTROL], "no-store");
    }

    #[tokio::test]
    async fn a_wrong_bearer_token_gets_no_figures() {
        let app = app(Some(TOKEN));
        let (_, _, body) = send(&app, get_page(Some("guessed-token-0000"))).await;
        assert!(!body.contains("Running for"));
    }

    #[tokio::test]
    async fn the_right_bearer_token_shows_the_page_without_personal_data() {
        let app = app(Some(TOKEN));
        let (status, _, body) = send(&app, get_page(Some(TOKEN))).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Running for"));
        assert!(body.contains("Connected players: 0"));
        assert!(!body.contains(TOKEN));
    }

    #[tokio::test]
    async fn a_wrong_token_at_the_form_is_refused() {
        let app = app(Some(TOKEN));
        let login = Request::builder()
            .method(Method::POST)
            .uri(LOGIN)
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(Body::from("token=wrong"))
            .expect("a request");
        let (status, headers, _) = send(&app, login).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        // The CSRF middleware sets its own cookie on every response: only the admin cookie must be absent.
        assert!(
            headers
                .get_all(header::SET_COOKIE)
                .iter()
                .all(|value| !value.as_bytes().starts_with(b"beelot_admin="))
        );
    }

    #[tokio::test]
    async fn the_cookie_stops_opening_the_page_once_its_half_hour_is_over() {
        use crate::clock::FakeClock;
        let clock = Arc::new(FakeClock::new(
            time::macros::datetime!(2026-11-20 12:00 UTC),
        ));
        let config =
            Config::from_vars(|name| (name == "BEELOT_ADMIN_TOKEN").then(|| TOKEN.to_owned()))
                .expect("a valid configuration");
        let app = router(AppState::new(config, clock.clone()));
        let login = Request::builder()
            .method(Method::POST)
            .uri(LOGIN)
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(Body::from(format!("token={TOKEN}")))
            .expect("a request");
        let (_, headers, _) = send(&app, login).await;
        let cookie = headers[header::SET_COOKIE]
            .to_str()
            .expect("text")
            .to_owned();
        let pair = cookie.split(';').next().expect("a pair").to_owned();
        let open = |pair: &str| {
            Request::builder()
                .method(Method::GET)
                .uri(PAGE)
                .header(header::COOKIE, pair.to_owned())
                .body(Body::empty())
                .expect("a request")
        };
        clock.advance(time::Duration::minutes(29));
        assert!(send(&app, open(&pair)).await.2.contains("Running for"));
        clock.advance(time::Duration::minutes(2));
        assert!(!send(&app, open(&pair)).await.2.contains("Running for"));
    }

    #[tokio::test]
    async fn the_right_token_at_the_form_sets_a_cookie_that_opens_the_page() {
        let app = app(Some(TOKEN));
        let login = Request::builder()
            .method(Method::POST)
            .uri(LOGIN)
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(Body::from(format!("token={TOKEN}")))
            .expect("a request");
        let (status, headers, _) = send(&app, login).await;
        assert_eq!(status, StatusCode::SEE_OTHER);
        let cookie = headers[header::SET_COOKIE]
            .to_str()
            .expect("text")
            .to_owned();
        assert!(cookie.contains("HttpOnly") && cookie.contains("SameSite=Strict"));
        assert!(!cookie.contains(TOKEN));
        let pair = cookie.split(';').next().expect("a pair");
        let request = Request::builder()
            .method(Method::GET)
            .uri(PAGE)
            .header(header::COOKIE, pair)
            .body(Body::empty())
            .expect("a request");
        let (status, _, body) = send(&app, request).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Running for"));
    }

    #[tokio::test]
    async fn guessing_the_token_is_limited() {
        let app = app(Some(TOKEN));
        let limit = crate::config::Limits::default().creations_per_window;
        let mut last = StatusCode::OK;
        for _ in 0..=limit {
            let login = Request::builder()
                .method(Method::POST)
                .uri(LOGIN)
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from("token=wrong"))
                .expect("a request");
            last = send(&app, login).await.0;
        }
        assert_eq!(last, StatusCode::TOO_MANY_REQUESTS);
        // The page is limited too: even the right token gets no figures until the window ends.
        let (status, _, body) = send(&app, get_page(Some(TOKEN))).await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert!(!body.contains("Running for"));
    }
}
