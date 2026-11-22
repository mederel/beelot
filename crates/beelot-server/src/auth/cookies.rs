//! Every cookie the server sets, built in this one place (US-178): the session, the CSRF token, the passkey ceremony and the
//! operator's page. A handler asks for the cookie by its purpose and never writes a `Set-Cookie` value, so none can forget
//! `Secure`, `HttpOnly` or `SameSite`.
//!
//! Over HTTPS (`secure`) every cookie carries `Secure`. The session and CSRF cookies also take the `__Host-` prefix, which
//! makes the browser refuse one set by a sibling domain or over plain HTTP. For one release the plain names are still
//! understood and, for the CSRF token, still set, because a page opened before the server was updated (and the page of
//! today, which reads `XSRF-TOKEN`) knows no other. The ceremony and operator cookies have a path other than `/`, which a
//! `__Host-` cookie cannot have, so they only gain `Secure`.

use axum::http::{HeaderMap, HeaderValue, header};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;

/// The session cookie's name before the `__Host-` prefix, still read (and cleared) for one release.
pub const SESSION: &str = "BEELOT_SESSION";
pub const SESSION_HOST: &str = "__Host-BEELOT_SESSION";
/// The CSRF cookie's plain name, still set over HTTPS for one release beside the prefixed one.
pub const CSRF: &str = "XSRF-TOKEN";
pub const CSRF_HOST: &str = "__Host-XSRF-TOKEN";
pub const CEREMONY: &str = "BEELOT_CEREMONY";
pub const ADMIN: &str = "beelot_admin";

const CEREMONY_PATH: &str = "/api/passkeys";
const CEREMONY_MAX_AGE: u32 = 300;
const ADMIN_PATH: &str = "/admin";

fn secure_attribute(secure: bool) -> &'static str {
    if secure { "; Secure" } else { "" }
}

/// The cookies that give the browser its session: the prefixed one over HTTPS (with the plain one cleared, so a browser
/// that has both keeps one), the plain one otherwise.
pub fn session(token: &str, secure: bool) -> Vec<String> {
    if secure {
        vec![
            format!("{SESSION_HOST}={token}; HttpOnly; SameSite=Lax; Path=/; Secure"),
            expired_plain_session(true),
        ]
    } else {
        vec![format!("{SESSION}={token}; HttpOnly; SameSite=Lax; Path=/")]
    }
}

fn expired_plain_session(secure: bool) -> String {
    format!(
        "{SESSION}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0{}",
        secure_attribute(secure)
    )
}

/// The cookies that take the session away, under both names over HTTPS.
pub fn session_cleared(secure: bool) -> Vec<String> {
    if secure {
        vec![
            format!("{SESSION_HOST}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure"),
            expired_plain_session(true),
        ]
    } else {
        vec![expired_plain_session(false)]
    }
}

/// A new, random CSRF token.
pub fn new_csrf_token() -> String {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).expect("the operating system's random generator");
    URL_SAFE_NO_PAD.encode(bytes)
}

/// The cookies that carry a CSRF `token`, readable by the client's script (so no `HttpOnly`): over HTTPS the prefixed one and,
/// for the release of the migration, the plain one with the same value.
pub fn csrf(token: &str, secure: bool) -> Vec<String> {
    if secure {
        vec![
            format!("{CSRF_HOST}={token}; SameSite=Lax; Path=/; Secure"),
            format!("{CSRF}={token}; SameSite=Lax; Path=/; Secure"),
        ]
    } else {
        vec![format!("{CSRF}={token}; SameSite=Lax; Path=/")]
    }
}

/// The cookie that names a passkey ceremony: only the passkey routes see it.
pub fn ceremony(id: &str, secure: bool) -> String {
    format!(
        "{CEREMONY}={id}; HttpOnly; SameSite=Strict; Path={CEREMONY_PATH}; Max-Age={CEREMONY_MAX_AGE}{}",
        secure_attribute(secure)
    )
}

/// The cookie that ends a ceremony: the attributes of [`ceremony`], so the browser matches it, with no life left.
pub fn ceremony_cleared(secure: bool) -> String {
    format!(
        "{CEREMONY}=; HttpOnly; SameSite=Strict; Path={CEREMONY_PATH}; Max-Age=0{}",
        secure_attribute(secure)
    )
}

/// The operator's page cookie, signed by the caller, good for `max_age` seconds.
pub fn admin(value: &str, max_age: u32, secure: bool) -> String {
    format!(
        "{ADMIN}={value}; Path={ADMIN_PATH}; Max-Age={max_age}; HttpOnly; SameSite=Strict{}",
        secure_attribute(secure)
    )
}

/// Adds each cookie to the response's headers.
pub fn append(headers: &mut HeaderMap, cookies: impl IntoIterator<Item = String>) {
    for cookie in cookies {
        headers.append(
            header::SET_COOKIE,
            HeaderValue::from_str(&cookie).expect("an ASCII cookie"),
        );
    }
}

/// The value of a cookie of the request.
pub fn value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(key, _)| *key == name)
        .map(|(_, value)| value)
}

/// The session token the request carries, under the prefixed name or, for pages and sessions from before it, the plain one.
pub fn session_token(headers: &HeaderMap) -> Option<&str> {
    [SESSION_HOST, SESSION]
        .into_iter()
        .filter_map(|name| value(headers, name))
        .find(|token| !token.is_empty())
}

/// The CSRF token the request carries: the prefixed cookie when there is one, else the plain one.
pub fn csrf_token(headers: &HeaderMap) -> Option<&str> {
    [CSRF_HOST, CSRF]
        .into_iter()
        .filter_map(|name| value(headers, name))
        .find(|token| !token.is_empty())
}

/// Whether the request carries the prefixed CSRF cookie.
pub fn has_prefixed_csrf(headers: &HeaderMap) -> bool {
    value(headers, CSRF_HOST).is_some_and(|token| !token.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn attributes(cookie: &str) -> Vec<&str> {
        cookie.split("; ").skip(1).collect()
    }

    fn names(cookies: &[String]) -> Vec<&str> {
        cookies
            .iter()
            .map(|cookie| cookie.split('=').next().unwrap())
            .collect()
    }

    #[test]
    fn the_session_cookie_is_http_only_lax_and_prefixed_over_https() {
        let plain = session("t", false);
        assert_eq!(plain, ["BEELOT_SESSION=t; HttpOnly; SameSite=Lax; Path=/"]);
        let https = session("t", true);
        assert_eq!(names(&https), ["__Host-BEELOT_SESSION", "BEELOT_SESSION"]);
        assert_eq!(
            attributes(&https[0]),
            ["HttpOnly", "SameSite=Lax", "Path=/", "Secure"]
        );
        assert!(https[0].starts_with("__Host-BEELOT_SESSION=t;"));
        // `__Host-` forbids a Domain and needs Path=/ and Secure.
        assert!(!https[0].contains("Domain"));
        assert!(https[1].starts_with("BEELOT_SESSION=;") && https[1].contains("Max-Age=0"));
        assert!(https[1].contains("Secure"));
    }

    #[test]
    fn clearing_the_session_clears_both_names_over_https() {
        let plain = session_cleared(false);
        assert_eq!(plain.len(), 1);
        assert!(plain[0].starts_with("BEELOT_SESSION=;") && !plain[0].contains("Secure"));
        let https = session_cleared(true);
        assert_eq!(names(&https), ["__Host-BEELOT_SESSION", "BEELOT_SESSION"]);
        assert!(
            https
                .iter()
                .all(|c| c.contains("Max-Age=0") && c.contains("; Secure"))
        );
    }

    #[test]
    fn the_csrf_cookie_is_readable_by_the_script_and_secure_over_https() {
        assert_eq!(csrf("v", false), ["XSRF-TOKEN=v; SameSite=Lax; Path=/"]);
        let https = csrf("v", true);
        assert_eq!(names(&https), ["__Host-XSRF-TOKEN", "XSRF-TOKEN"]);
        for cookie in &https {
            assert_eq!(attributes(cookie), ["SameSite=Lax", "Path=/", "Secure"]);
            assert!(!cookie.contains("HttpOnly"), "the client reads it");
        }
    }

    #[test]
    fn the_ceremony_cookie_and_its_clearing_have_the_same_attributes() {
        assert_eq!(
            ceremony("id", false),
            "BEELOT_CEREMONY=id; HttpOnly; SameSite=Strict; Path=/api/passkeys; Max-Age=300"
        );
        assert_eq!(
            ceremony("id", true),
            "BEELOT_CEREMONY=id; HttpOnly; SameSite=Strict; Path=/api/passkeys; Max-Age=300; Secure"
        );
        for secure in [false, true] {
            let kept = ceremony("id", secure);
            let cleared = ceremony_cleared(secure);
            let without_life = |cookie: &str| {
                attributes(cookie)
                    .into_iter()
                    .filter(|attribute| !attribute.starts_with("Max-Age"))
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
            };
            assert_eq!(without_life(&kept), without_life(&cleared));
            assert!(cleared.starts_with("BEELOT_CEREMONY=;") && cleared.contains("Max-Age=0"));
        }
    }

    #[test]
    fn the_admin_cookie_is_scoped_strict_and_secure_over_https() {
        assert_eq!(
            admin("v", 1800, false),
            "beelot_admin=v; Path=/admin; Max-Age=1800; HttpOnly; SameSite=Strict"
        );
        assert_eq!(
            admin("v", 1800, true),
            "beelot_admin=v; Path=/admin; Max-Age=1800; HttpOnly; SameSite=Strict; Secure"
        );
    }

    #[test]
    fn the_prefixed_name_wins_and_the_plain_one_is_the_fallback() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("BEELOT_SESSION=old; XSRF-TOKEN=oldx"),
        );
        assert_eq!(session_token(&headers), Some("old"));
        assert_eq!(csrf_token(&headers), Some("oldx"));
        assert!(!has_prefixed_csrf(&headers));
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static(
                "BEELOT_SESSION=old; __Host-BEELOT_SESSION=new; XSRF-TOKEN=oldx; __Host-XSRF-TOKEN=newx",
            ),
        );
        assert_eq!(session_token(&headers), Some("new"));
        assert_eq!(csrf_token(&headers), Some("newx"));
        assert!(has_prefixed_csrf(&headers));
    }
}
