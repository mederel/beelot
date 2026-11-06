//! The per-client limits on `/api/*` requests.

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
use crate::error::AppError;

/// Every API request counts against `general`; requests that create a table also count against `creation`.
#[derive(Debug)]
pub struct RateLimits {
    general: FixedWindowLimiter,
    creation: FixedWindowLimiter,
    trust_forwarded: bool,
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
                clock,
            ),
            trust_forwarded: config.trust_forwarded_headers,
        }
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
            "/api/tables" | "/api/tables/join" | "/api/matchmaking/quick-match"
        )
}

pub async fn rate_limit(
    State(limits): State<Arc<RateLimits>>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    if !path.starts_with("/api/") {
        return next.run(request).await;
    }
    let client = client_ip(
        request.headers(),
        peer(request.extensions()),
        limits.trust_forwarded,
    )
    .to_string();
    let general = limits.general.consume(&client).err().unwrap_or(0);
    let creation = if is_creation(request.method(), path) {
        limits.creation.consume(&client).err().unwrap_or(0)
    } else {
        0
    };
    let retry_after_secs = general.max(creation);
    if retry_after_secs > 0 {
        return AppError::RateLimited { retry_after_secs }.into_response();
    }
    next.run(request).await
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
