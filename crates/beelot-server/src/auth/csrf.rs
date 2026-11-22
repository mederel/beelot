//! The CSRF rule: the client reads the token from the `XSRF-TOKEN` (`__Host-XSRF-TOKEN` over HTTPS)
//! cookie and sends it back in the `X-XSRF-TOKEN` header. A request that changes state needs it once a session
//! exists, and always on the passkey ceremonies, which start one. Guests have no session to abuse.

use axum::extract::Request;
use axum::http::{HeaderValue, Method, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use sha2::{Digest, Sha256};

use super::cookies;
use super::sessions;
use crate::error::AppError;

pub const HEADER: &str = "x-xsrf-token";

const CEREMONIES: [&str; 4] = [
    "/api/passkeys/sign-up/options",
    "/api/passkeys/sign-up",
    "/api/passkeys/sign-in/options",
    "/api/passkeys/sign-in",
];

/// Compares two secrets in a time that depends on neither where they differ nor their lengths: both are hashed to
/// 32 bytes first, and the hashes are compared without stopping at the first difference (US-181; also used by the
/// operator's status page, US-152).
pub(crate) fn equal(a: &[u8], b: &[u8]) -> bool {
    let (a, b) = (Sha256::digest(a), Sha256::digest(b));
    a.iter()
        .zip(b.iter())
        .fold(0u8, |diff, (x, y)| diff | (x ^ y))
        == 0
}

pub async fn protect(secure: bool, request: Request, next: Next) -> Response {
    let headers = request.headers();
    let token = cookies::csrf_token(headers);
    let unsafe_method = !matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS | Method::TRACE
    );
    let needed = unsafe_method
        && (sessions::token(headers).is_some()
            || (request.method() == Method::POST && CEREMONIES.contains(&request.uri().path())));
    if needed {
        let sent = headers.get(HEADER).map(HeaderValue::as_bytes);
        let matches =
            matches!((token, sent), (Some(token), Some(sent)) if equal(token.as_bytes(), sent));
        if !matches {
            return AppError::Forbidden { reason: None }.into_response();
        }
    }
    // Over HTTPS a client that has no prefixed cookie yet (a page opened before the update, a first visit) is given a new
    // token under both names; over HTTP the one plain cookie is given to a client that has none.
    let needs_token = if secure {
        !cookies::has_prefixed_csrf(headers)
    } else {
        token.is_none()
    };
    let mut response = next.run(request).await;
    let rotated = response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .any(|value| {
            [cookies::CSRF_HOST, cookies::CSRF]
                .iter()
                .any(|name| value.as_bytes().starts_with(format!("{name}=").as_bytes()))
        });
    if needs_token && !rotated {
        cookies::append(
            response.headers_mut(),
            cookies::csrf(&cookies::new_csrf_token(), secure),
        );
    }
    response
}

#[cfg(test)]
mod tests {
    use super::equal;

    #[test]
    fn secrets_are_equal_only_when_they_are_the_same_bytes() {
        assert!(equal(b"secret", b"secret"));
        assert!(equal(b"", b""));
        assert!(!equal(b"secret", b"secreT"));
        assert!(!equal(b"secret", b"secret-longer"));
        assert!(!equal(b"secret-longer", b"secret"));
        assert!(!equal(b"", b"secret"));
        assert!(!equal(b"secret", b""));
    }
}
