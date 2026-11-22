//! The per-client limits on `/api/*` requests and on the operator's page.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use axum::extract::{ConnectInfo, FromRequestParts, Request, State};
use axum::http::request::Parts;
use axum::http::{Extensions, HeaderMap, Method};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::window::{FixedWindowLimiter, MAX_TRACKED};
use crate::app::AppState;
use crate::clock::Clock;
use crate::config::Config;
use crate::error::{AppError, InvalidCode};

/// Every API request counts against `general`; requests that create a table also count against `creation`.
#[derive(Debug)]
pub struct RateLimits {
    general: FixedWindowLimiter<IpAddr>,
    creation: FixedWindowLimiter<IpAddr>,
    /// The hints and analyses, which are searches (US-173).
    solves: FixedWindowLimiter<IpAddr>,
    /// Invitation codes that named no table, per client.
    guesses: FixedWindowLimiter<IpAddr>,
    trust_forwarded: bool,
    guess_window_secs: u64,
}

impl RateLimits {
    pub fn new(config: &Config, clock: Arc<dyn Clock>) -> Self {
        let limits = &config.limits;
        Self {
            general: FixedWindowLimiter::new(
                limits.requests_per_window,
                limits.rate_window,
                MAX_TRACKED,
                clock.clone(),
            ),
            creation: FixedWindowLimiter::new(
                limits.creations_per_window,
                limits.rate_window,
                MAX_TRACKED,
                clock.clone(),
            ),
            solves: FixedWindowLimiter::new(
                limits.solves_per_window,
                limits.rate_window,
                MAX_TRACKED,
                clock.clone(),
            ),
            guesses: FixedWindowLimiter::new(
                limits.failed_codes_per_window,
                limits.rate_window,
                MAX_TRACKED,
                clock,
            ),
            trust_forwarded: config.trust_forwarded_headers,
            guess_window_secs: limits.rate_window.as_secs(),
        }
    }

    /// Forgets the clients whose window has ended. The server runs it on a timer (see `jobs`).
    pub fn sweep(&self) {
        self.general.sweep();
        self.creation.sweep();
        self.solves.sweep();
        self.guesses.sweep();
    }
}

/// The client's address: the rightmost valid address of `X-Forwarded-For` when the proxy is trusted, otherwise the
/// peer's. The rightmost entry is the one the trusted proxy appended; the ones before it come from the client, who
/// can write anything there, so they must never decide which limit applies.
pub fn client_ip(headers: &HeaderMap, peer: SocketAddr, trust_forwarded: bool) -> IpAddr {
    if trust_forwarded {
        let forwarded = headers
            .get_all("x-forwarded-for")
            .iter()
            .filter_map(|value| value.to_str().ok())
            .flat_map(|value| value.split(','))
            .filter_map(|part| part.trim().parse::<IpAddr>().ok())
            .next_back();
        if let Some(ip) = forwarded {
            return ip;
        }
    }
    peer.ip()
}

/// The key the limits count a client under: its address, except that an IPv6 client is counted by its /64 prefix
/// (the address with its last 64 bits cleared). A subscriber holds a whole /64, so counting each address would give
/// an attacker as many limits as it likes.
pub fn limit_key(ip: IpAddr) -> IpAddr {
    match ip.to_canonical() {
        IpAddr::V4(v4) => IpAddr::V4(v4),
        IpAddr::V6(v6) => {
            let prefix = u128::from(v6) & !((1u128 << 64) - 1);
            IpAddr::V6(std::net::Ipv6Addr::from(prefix))
        }
    }
}

/// The peer's address, or the unspecified address when the server runs without connection info (tests).
pub fn peer(extensions: &Extensions) -> SocketAddr {
    extensions
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0)
        .unwrap_or(SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0)))
}

/// The client's address, as the rate limits count it.
#[derive(Debug, Clone, Copy)]
pub struct ClientIp(pub IpAddr);

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(ClientIp(client_ip(
            &parts.headers,
            peer(&parts.extensions),
            state.config.trust_forwarded_headers,
        )))
    }
}

fn is_creation(method: &Method, path: &str) -> bool {
    method == Method::POST
        && matches!(
            path,
            "/api/tables"
                | "/api/tables/join"
                | "/api/tables/watch"
                | "/api/matchmaking/quick-match"
        )
}

/// The two routes that run a search: `/api/tables/{id}/hint` and `/api/tables/{id}/analysis` (US-173).
fn is_solve(method: &Method, path: &str) -> bool {
    method == Method::GET
        && path
            .strip_prefix("/api/tables/")
            .and_then(|rest| rest.split_once('/'))
            .is_some_and(|(_, route)| matches!(route, "hint" | "analysis"))
}

/// The operator's page and its sign-in: every try counts against the creation limit, the strictest, so the token
/// cannot be guessed at the speed of the general limit.
fn is_admin(path: &str) -> bool {
    path.starts_with("/admin/")
}

/// The requests that try an invitation code.
fn is_code_attempt(method: &Method, path: &str) -> bool {
    method == Method::POST && matches!(path, "/api/tables/join" | "/api/tables/watch")
}

pub async fn rate_limit(
    State(limits): State<Arc<RateLimits>>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    if !path.starts_with("/api/") && !is_admin(path) {
        return next.run(request).await;
    }
    let client = limit_key(client_ip(
        request.headers(),
        peer(request.extensions()),
        limits.trust_forwarded,
    ));
    let general = limits.general.consume(&client).err().unwrap_or(0);
    let creation = if is_creation(request.method(), path) || is_admin(path) {
        limits.creation.consume(&client).err().unwrap_or(0)
    } else {
        0
    };
    let solve = if is_solve(request.method(), path) {
        limits.solves.consume(&client).err().unwrap_or(0)
    } else {
        0
    };
    let retry_after_secs = general.max(creation).max(solve);
    if retry_after_secs > 0 {
        return AppError::RateLimited { retry_after_secs }.into_response();
    }
    if !is_code_attempt(request.method(), path) {
        return next.run(request).await;
    }
    // A client that keeps naming codes that exist nowhere is guessing: it is refused until its window ends.
    if limits.guesses.is_full(&client) {
        return AppError::RateLimited {
            retry_after_secs: limits.guess_window_secs,
        }
        .into_response();
    }
    let response = next.run(request).await;
    if response.extensions().get::<InvalidCode>().is_some() {
        let _ = limits.guesses.consume(&client);
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(forwarded: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", forwarded.parse().unwrap());
        headers
    }

    #[test]
    fn an_address_forged_by_the_client_does_not_change_its_limit() {
        // The proxy appended the real address (5.5.5.5) after what the client sent.
        let first = client_ip(&headers("1.1.1.1, 5.5.5.5"), PEER, true);
        let second = client_ip(&headers("2.2.2.2, 5.5.5.5"), PEER, true);
        assert_eq!(first, second);
        assert_eq!(first, "5.5.5.5".parse::<IpAddr>().unwrap());
    }

    #[test]
    fn an_ipv6_client_is_counted_by_its_64_prefix() {
        let key = |text: &str| limit_key(text.parse().unwrap());
        assert_eq!(
            key("2001:db8:1:2::1"),
            key("2001:db8:1:2:ffff:ffff:ffff:ffff")
        );
        assert_ne!(key("2001:db8:1:2::1"), key("2001:db8:1:3::1"));
    }

    #[test]
    fn an_ipv4_client_keeps_its_own_key_and_a_mapped_one_is_the_same_client() {
        let key = |text: &str| limit_key(text.parse().unwrap());
        assert_eq!(key("203.0.113.7"), "203.0.113.7".parse::<IpAddr>().unwrap());
        assert_eq!(key("::ffff:203.0.113.7"), key("203.0.113.7"));
        assert_ne!(key("203.0.113.7"), key("203.0.113.8"));
    }

    #[test]
    fn only_the_hint_and_the_analysis_count_as_solves() {
        let solve = |method, path| is_solve(&method, path);
        assert!(solve(Method::GET, "/api/tables/abc/hint"));
        assert!(solve(Method::GET, "/api/tables/abc/analysis"));
        assert!(!solve(Method::GET, "/api/tables/abc/explanations"));
        assert!(!solve(Method::GET, "/api/tables/abc"));
        assert!(!solve(Method::POST, "/api/tables/abc/hint"));
        assert!(!solve(Method::GET, "/api/tables/abc/hint/extra"));
    }

    const PEER: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(9, 9, 9, 9)), 1234);

    #[test]
    fn forwarded_header_is_ignored_unless_trusted() {
        assert_eq!(client_ip(&headers("1.1.1.1"), PEER, false), PEER.ip());
        assert_eq!(
            client_ip(&headers("1.1.1.1"), PEER, true),
            "1.1.1.1".parse::<IpAddr>().unwrap()
        );
    }

    #[test]
    fn trusted_forwarded_header_gives_its_rightmost_valid_address() {
        assert_eq!(
            client_ip(&headers("junk, 2001:db8::1, 3.3.3.3, junk"), PEER, true),
            "3.3.3.3".parse::<IpAddr>().unwrap()
        );
        assert_eq!(client_ip(&headers("junk"), PEER, true), PEER.ip());
        assert_eq!(client_ip(&HeaderMap::new(), PEER, true), PEER.ip());
    }
}
