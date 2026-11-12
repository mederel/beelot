//! The running version and the page of its release notes (US-131).

use axum::extract::State;
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use crate::app::AppState;

/// What a build outside a release reports.
pub const DEV: &str = "dev";

/// The version of the release this build is for: the release workflow gives it as `BEELOT_VERSION` at compile time.
pub const VERSION: &str = match option_env!("BEELOT_VERSION") {
    Some(version) => version,
    None => DEV,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/version", get(version))
}

/// The release notes of `version` in the repository at `repository_url`; a build outside a release has none.
pub fn release_url(repository_url: &str, version: &str) -> Option<String> {
    let version = version.trim();
    let repository = repository_url.trim().trim_end_matches('/');
    if version.is_empty() || version == DEV || repository.is_empty() {
        return None;
    }
    Some(format!("{repository}/releases/tag/v{version}"))
}

async fn version(State(state): State<AppState>) -> Response {
    let body = json!({
        "version": VERSION,
        "releaseUrl": release_url(&state.config.repository_url, VERSION),
    });
    let mut response = Json(body).into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=300"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_release_links_to_its_tag() {
        assert_eq!(
            release_url("https://github.com/mederel/beelot", "1.12.0").as_deref(),
            Some("https://github.com/mederel/beelot/releases/tag/v1.12.0")
        );
        assert_eq!(
            release_url(" https://example.org/fork/ ", "2.0.1").as_deref(),
            Some("https://example.org/fork/releases/tag/v2.0.1")
        );
    }

    #[test]
    fn a_dev_build_or_a_blank_repository_has_no_link() {
        assert_eq!(release_url("https://github.com/mederel/beelot", DEV), None);
        assert_eq!(release_url("https://github.com/mederel/beelot", " "), None);
        assert_eq!(release_url("  ", "1.0.0"), None);
    }
}
