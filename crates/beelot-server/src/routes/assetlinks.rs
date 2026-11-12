//! The Digital Asset Links file that ties the Android app to the website (US-127): the browser checks it before it
//! shows the site in the app without an address bar, and passkeys use it for the app's sign-in.

use axum::extract::State;
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use crate::app::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/.well-known/assetlinks.json", get(assetlinks))
}

/// A SHA-256 certificate fingerprint as Android prints it: 32 pairs of hexadecimal digits separated by colons.
/// Returns it in upper case, or `None` when it is not one.
pub fn normalize_fingerprint(text: &str) -> Option<String> {
    let text = text.trim().to_ascii_uppercase();
    let pairs: Vec<&str> = text.split(':').collect();
    let valid = pairs.len() == 32
        && pairs
            .iter()
            .all(|pair| pair.len() == 2 && pair.bytes().all(|byte| byte.is_ascii_hexdigit()));
    valid.then_some(text)
}

/// The links file for `package` and the fingerprints of the certificates the app is signed with. With no
/// fingerprint the file lists no app, which is a valid file: no app is verified.
pub fn document(package: &str, fingerprints: &[String]) -> serde_json::Value {
    if fingerprints.is_empty() {
        return json!([]);
    }
    json!([{
        "relation": [
            "delegate_permission/common.handle_all_urls",
            "delegate_permission/common.get_login_creds"
        ],
        "target": {
            "namespace": "android_app",
            "package_name": package,
            "sha256_cert_fingerprints": fingerprints,
        }
    }])
}

async fn assetlinks(State(state): State<AppState>) -> Response {
    let config = &state.config;
    let mut response = Json(document(
        &config.android_package,
        &config.android_cert_sha256,
    ))
    .into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=3600"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    const FINGERPRINT: &str = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

    #[test]
    fn a_fingerprint_is_32_colon_separated_bytes() {
        assert_eq!(
            normalize_fingerprint(FINGERPRINT).as_deref(),
            Some(FINGERPRINT)
        );
        assert_eq!(
            normalize_fingerprint(&format!(" {} ", FINGERPRINT.to_lowercase())).as_deref(),
            Some(FINGERPRINT)
        );
        assert_eq!(normalize_fingerprint(""), None);
        assert_eq!(normalize_fingerprint("14:6D"), None);
        assert_eq!(normalize_fingerprint(&FINGERPRINT.replace(':', "")), None);
        assert_eq!(
            normalize_fingerprint(&FINGERPRINT.replace("14", "ZZ")),
            None
        );
    }

    #[test]
    fn the_document_names_the_package_and_its_fingerprints() {
        let document = document("fr.beelot.app", &[FINGERPRINT.to_string()]);
        let statement = &document[0];
        assert_eq!(statement["target"]["namespace"], "android_app");
        assert_eq!(statement["target"]["package_name"], "fr.beelot.app");
        assert_eq!(
            statement["target"]["sha256_cert_fingerprints"][0],
            FINGERPRINT
        );
        let relations: Vec<&str> = statement["relation"]
            .as_array()
            .unwrap()
            .iter()
            .map(|relation| relation.as_str().unwrap())
            .collect();
        assert!(relations.contains(&"delegate_permission/common.handle_all_urls"));
        assert!(relations.contains(&"delegate_permission/common.get_login_creds"));
    }

    #[test]
    fn without_a_fingerprint_no_app_is_verified() {
        assert_eq!(document("fr.beelot.app", &[]), json!([]));
    }
}
