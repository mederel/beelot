//! The application state and the router.

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderName, HeaderValue, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use sqlx::MySqlPool;
use sqlx::mysql::MySqlPoolOptions;
use tower::ServiceBuilder;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use crate::auth::csrf;
use crate::auth::passkeys::Passkeys;
use crate::clock::Clock;
use crate::config::Config;
use crate::error::AppError;
use crate::limits::{self, RateLimits};
use crate::logs::ErrorLog;
use crate::privacy::events::SecurityEvents;
use crate::routes;
use crate::tables::TableRegistry;
use crate::tables::TableSetup;
use crate::tables::finished::{MatchSink, NoopSink};

/// What every handler can reach. Cloning it is cheap.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub clock: Arc<dyn Clock>,
    pub rate_limits: Arc<RateLimits>,
    /// How many hints and analyses run at once (US-173).
    pub solvers: limits::SolverGate,
    pub registry: Arc<TableRegistry>,
    pub sink: Arc<dyn MatchSink>,
    /// Lazy until a request needs it: guests' requests never do.
    pub pool: MySqlPool,
    pub passkeys: Arc<Passkeys>,
    pub events: Arc<SecurityEvents>,
    /// When the server started, for the operator's status page (US-152).
    pub started: std::time::Instant,
    /// The recent warnings and errors of the log (US-152); empty unless `main` installs the log layer.
    pub errors: Arc<ErrorLog>,
    /// The top of each leaderboard, read once a minute (US-182).
    pub leaderboards: Arc<crate::top_cache::TopCache<Vec<crate::db::ratings::BoardEntry>>>,
}

impl AppState {
    /// A state on this configuration; a database URL that does not parse is an error, as in `db::connect` (US-190).
    pub fn new(config: Config, clock: Arc<dyn Clock>) -> anyhow::Result<Self> {
        let pool = MySqlPoolOptions::new().connect_lazy_with(crate::db::options(&config)?);
        let passkeys = Passkeys::new(&config.public_url, &config.limits, clock.clone())
            .expect("a public URL checked by the configuration");
        let leaderboard_cache = config.limits.leaderboard_cache;
        let state = Self {
            events: Arc::new(SecurityEvents::new(
                pool.clone(),
                &config.limits,
                clock.clone(),
            )),
            pool,
            passkeys: Arc::new(passkeys),
            rate_limits: Arc::new(RateLimits::new(&config, clock.clone())),
            solvers: limits::SolverGate::new(config.limits.max_concurrent_solves),
            registry: Arc::new(TableRegistry::new(&config.limits, clock.clone())),
            config: Arc::new(config),
            clock,
            sink: Arc::new(NoopSink),
            started: std::time::Instant::now(),
            errors: ErrorLog::new(),
            leaderboards: Arc::new(crate::top_cache::TopCache::new(leaderboard_cache)),
        };
        Ok(state.wire_tables())
    }

    /// The tables hand the outcomes of their own changes to the sink and the database this state holds now.
    fn wire_tables(self) -> Self {
        let (sink, pool) = (self.sink.clone(), self.pool.clone());
        self.registry
            .on_outcome(move |outcome| hand_over_one(&sink, &pool, outcome));
        self
    }

    /// The log that the status page shows: `main` gives the one its log layer feeds.
    pub fn with_error_log(mut self, errors: Arc<ErrorLog>) -> Self {
        self.errors = errors;
        self
    }

    /// Tables are set up by `setup`: tests deal from seeded generators. Call it before any table exists.
    pub fn with_table_setup(
        mut self,
        setup: impl Fn() -> TableSetup + Send + Sync + 'static,
    ) -> Self {
        self.registry =
            Arc::new(TableRegistry::new(&self.config.limits, self.clock.clone()).with_setup(setup));
        self.wire_tables()
    }

    pub fn with_pool(mut self, pool: MySqlPool) -> Self {
        self.events = Arc::new(SecurityEvents::new(
            pool.clone(),
            &self.config.limits,
            self.clock.clone(),
        ));
        self.pool = pool;
        self.wire_tables()
    }

    /// Whether cookies are only sent over HTTPS: when players reach Beelot through it.
    pub fn secure_cookies(&self) -> bool {
        self.config.public_url.starts_with("https://")
    }

    /// Finished matches go to `sink`.
    pub fn with_sink(mut self, sink: Arc<dyn MatchSink>) -> Self {
        self.sink = sink;
        self.wire_tables()
    }

    /// Hands a finished match to the sink, in the background.
    pub fn hand_over(&self, outcomes: impl IntoIterator<Item = crate::tables::Outcome>) {
        for outcome in outcomes {
            hand_over_one(&self.sink, &self.pool, outcome);
        }
    }
}

/// Hands one outcome of a table to the sink and the database, in the background.
fn hand_over_one(sink: &Arc<dyn MatchSink>, pool: &MySqlPool, outcome: crate::tables::Outcome) {
    if let Some(finished) = outcome.finished {
        let sink = sink.clone();
        tokio::spawn(async move { sink.record(finished).await });
    }
    // The score of a daily round (US-150); a failure is logged, and the attempt stays without a score.
    if let Some(result) = outcome.daily {
        let pool = pool.clone();
        tokio::spawn(async move {
            if let Err(error) =
                crate::db::daily::record(&pool, result.day, result.account, result.score).await
            {
                tracing::warn!(%error, "could not record a daily score");
            }
        });
    }
}

/// The paths of the single-page frontend, answered with `index.html`.
const SPA_PATHS: [&str; 16] = [
    "/play/bot",
    "/play/local",
    "/play/bot/bidding/{id}",
    "/play/bot/game/{id}",
    "/online/private",
    "/online/private/new",
    "/online/private/table/{id}",
    "/online/public",
    "/online/public/table/{id}",
    "/tutorial",
    "/rules",
    "/settings",
    "/stats",
    "/leaderboard",
    "/friends/add/{code}",
    "/privacy",
];

/// What the pages may load: only this origin's own files. No inline script or style, no plugin, no base override,
/// and nobody may frame the pages (sign-in, passkey and account deletion screens must not be clickjacked).
const CONTENT_SECURITY_POLICY: &str = "default-src 'self'; script-src 'self'; style-src 'self'; \
    img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; \
    form-action 'self'; frame-ancestors 'none'";

/// Sent once players reach Beelot over HTTPS: browsers then refuse plain HTTP for a year.
const STRICT_TRANSPORT_SECURITY: &str = "max-age=31536000";

static REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

pub fn router(state: AppState) -> Router {
    let static_dir = &state.config.static_dir;
    let index = ServeFile::new(static_dir.join("index.html"));
    let mut router = routes::api()
        .merge(routes::admin::routes())
        .route("/api/{*rest}", axum::routing::any(not_found));
    for path in SPA_PATHS {
        router = router.route_service(path, index.clone());
    }
    let files = ServeDir::new(static_dir).not_found_service(axum::routing::any(not_found));
    let max_header_bytes = state.config.limits.max_header_bytes;
    let max_request_bytes = state.config.limits.max_request_bytes;
    let rate_limits = state.rate_limits.clone();
    let trust_forwarded = state.config.trust_forwarded_headers;
    let browser_traces = state.config.browser_traces;
    let secure_cookies = state.secure_cookies();
    let hsts = secure_cookies.then(|| {
        SetResponseHeaderLayer::overriding(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static(STRICT_TRANSPORT_SECURITY),
        )
    });

    router.fallback_service(files).with_state(state).layer(
        ServiceBuilder::new()
            // How long each request takes, by route template (US-155); outermost, so it counts the other layers too.
            .layer(middleware::from_fn(crate::metrics::track))
            // The request's span (US-156): the metrics' layer is outside it, so the span only covers the answer.
            .layer(middleware::from_fn(move |request, next| {
                crate::traces::track(trust_forwarded, browser_traces, request, next)
            }))
            // Pages, scripts and texts are revalidated on every load (a 304 when unchanged), so a new version is never
            // hidden behind a browser's guess of how long a file stays fresh.
            .layer(SetResponseHeaderLayer::if_not_present(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-cache"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::REFERRER_POLICY,
                HeaderValue::from_static("no-referrer"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::CONTENT_SECURITY_POLICY,
                HeaderValue::from_static(CONTENT_SECURITY_POLICY),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_FRAME_OPTIONS,
                HeaderValue::from_static("DENY"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                HeaderName::from_static("permissions-policy"),
                HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
            ))
            .option_layer(hsts)
            .layer(SetRequestIdLayer::new(REQUEST_ID.clone(), MakeRequestUuid))
            .layer(TraceLayer::new_for_http().make_span_with(request_span))
            .layer(PropagateRequestIdLayer::new(REQUEST_ID.clone()))
            .layer(middleware::from_fn(move |request, next| {
                limit_headers(max_header_bytes, request, next)
            }))
            .layer(middleware::from_fn_with_state(
                rate_limits,
                limits::rate::rate_limit,
            ))
            .layer(middleware::from_fn(move |request, next| {
                csrf::protect(secure_cookies, request, next)
            }))
            .layer(limits::size::layer(max_request_bytes)),
    )
}

async fn not_found() -> AppError {
    AppError::NotFound
}

/// One span per request with its method, its path and its request id. The query string is left out: it may carry
/// a player token.
fn request_span(request: &Request<Body>) -> tracing::Span {
    let request_id = request
        .headers()
        .get(&REQUEST_ID)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    tracing::info_span!(
        "request",
        method = %request.method(),
        path = %request.uri().path(),
        request_id = %request_id,
    )
}

/// Refuses a request whose headers, names and values together, exceed the limit.
async fn limit_headers(max_bytes: usize, request: Request, next: Next) -> Response {
    let size: usize = request
        .headers()
        .iter()
        .map(|(name, value)| name.as_str().len() + value.len())
        .sum();
    if size > max_bytes {
        return StatusCode::REQUEST_HEADER_FIELDS_TOO_LARGE.into_response();
    }
    next.run(request).await
}
