//! The server's metrics, exported through OpenTelemetry (US-155).
//!
//! The instruments come from the global meter, which is a no-op until `main` installs a provider
//! ([`crate::telemetry::start`]), so nothing here costs more than an atomic read when no endpoint is set. No attribute
//! holds a player, an account, a table identifier, an address or a path as requested: the route is the template the
//! router matched, the method is one of the standard ones, and the table kind is one of three words.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use axum::extract::{MatchedPath, Request};
use axum::middleware::Next;
use axum::response::Response;
use opentelemetry::metrics::{Counter, Histogram};
use opentelemetry::{KeyValue, global};
use tokio_util::sync::CancellationToken;

use crate::routes::health::database_reachable;
use crate::tables::TableRegistry;
use crate::tables::seats::TableKind;

/// The route of a request that matched none.
pub const UNMATCHED: &str = "unmatched";
/// How often the database is asked whether it answers, for `beelot.database.up`.
const DATABASE_CHECK_EVERY: Duration = Duration::from_secs(15);

fn meter() -> opentelemetry::metrics::Meter {
    global::meter("beelot")
}

/// The method as a bounded value: anything but the standard methods is `_OTHER`.
pub fn method_label(method: &str) -> &'static str {
    match method {
        "GET" => "GET",
        "POST" => "POST",
        "PUT" => "PUT",
        "DELETE" => "DELETE",
        "PATCH" => "PATCH",
        "HEAD" => "HEAD",
        "OPTIONS" => "OPTIONS",
        _ => "_OTHER",
    }
}

/// The kind of a table as the word the metrics use.
pub fn kind_label(kind: TableKind) -> &'static str {
    match kind {
        TableKind::Local => "local",
        TableKind::Private => "private",
        TableKind::Public => "public",
    }
}

/// The attributes of one request: the template of its route, never the path as requested.
pub fn request_attributes(method: &str, route: Option<&str>, status: u16) -> [KeyValue; 3] {
    [
        KeyValue::new("http.request.method", method_label(method)),
        KeyValue::new("http.route", route.unwrap_or(UNMATCHED).to_owned()),
        KeyValue::new("http.response.status_code", i64::from(status)),
    ]
}

fn request_duration() -> &'static Histogram<f64> {
    static HISTOGRAM: OnceLock<Histogram<f64>> = OnceLock::new();
    HISTOGRAM.get_or_init(|| {
        meter()
            .f64_histogram("http.server.request.duration")
            .with_unit("s")
            .with_description("The time to answer a request, until its response starts")
            .build()
    })
}

fn matches_counter(name: &'static str, description: &'static str) -> Counter<u64> {
    meter()
        .u64_counter(name)
        .with_description(description)
        .build()
}

/// A match was dealt at a table of `kind`.
pub fn match_started(kind: TableKind) {
    static COUNTER: OnceLock<Counter<u64>> = OnceLock::new();
    COUNTER
        .get_or_init(|| matches_counter("beelot.matches.started", "Matches begun"))
        .add(1, &[KeyValue::new("beelot.table.kind", kind_label(kind))]);
}

/// A match reached its target at a table of `kind`.
pub fn match_completed(kind: TableKind) {
    static COUNTER: OnceLock<Counter<u64>> = OnceLock::new();
    COUNTER
        .get_or_init(|| {
            matches_counter("beelot.matches.completed", "Matches played to their target")
        })
        .add(1, &[KeyValue::new("beelot.table.kind", kind_label(kind))]);
}

/// Records how long each request took, with its route template, method and status. It never reads the body.
pub async fn track(request: Request, next: Next) -> Response {
    let started = Instant::now();
    let method = request.method().as_str().to_owned();
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str().to_owned());
    let response = next.run(request).await;
    request_duration().record(
        started.elapsed().as_secs_f64(),
        &request_attributes(&method, route.as_deref(), response.status().as_u16()),
    );
    response
}

/// Registers the gauges that read the server's state each time the metrics are exported, and the task that asks the
/// database whether it answers. The task stops with `cancel`.
pub fn observe(
    registry: Arc<TableRegistry>,
    pool: sqlx::MySqlPool,
    cancel: CancellationToken,
) -> tokio::task::JoinHandle<()> {
    let meter = meter();
    let tables = registry.clone();
    let _ = meter
        .u64_observable_gauge("beelot.tables.open")
        .with_description("Open tables, by kind")
        .with_callback(move |observer| {
            for (kind, count) in tables.kind_counts() {
                observer.observe(
                    u64::try_from(count).unwrap_or(u64::MAX),
                    &[KeyValue::new("beelot.table.kind", kind_label(kind))],
                );
            }
        })
        .build();
    let players = registry;
    let _ = meter
        .u64_observable_gauge("beelot.players.connected")
        .with_description("Human players with an open event stream at their seat")
        .with_callback(move |observer| {
            observer.observe(
                u64::try_from(players.connected_players()).unwrap_or(u64::MAX),
                &[],
            );
        })
        .build();
    // The export callback cannot wait on the database, so a task keeps the last answer.
    let up = Arc::new(AtomicBool::new(true));
    let read = up.clone();
    let _ = meter
        .u64_observable_gauge("beelot.database.up")
        .with_description("1 when the database answers, 0 when it does not")
        .with_callback(move |observer| {
            observer.observe(u64::from(read.load(Ordering::Relaxed)), &[]);
        })
        .build();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(DATABASE_CHECK_EVERY);
        loop {
            tokio::select! {
                () = cancel.cancelled() => break,
                _ = tick.tick() => up.store(database_reachable(&pool).await, Ordering::Relaxed),
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request as HttpRequest, StatusCode};
    use axum::middleware::from_fn;
    use axum::routing::get;
    use tower::ServiceExt;

    use super::*;

    fn value<'a>(attributes: &'a [KeyValue], key: &str) -> Option<&'a opentelemetry::Value> {
        attributes
            .iter()
            .find(|attribute| attribute.key.as_str() == key)
            .map(|attribute| &attribute.value)
    }

    #[test]
    fn only_the_standard_methods_are_named() {
        assert_eq!(method_label("GET"), "GET");
        assert_eq!(method_label("PATCH"), "PATCH");
        assert_eq!(method_label("BREW"), "_OTHER");
        assert_eq!(method_label("get"), "_OTHER");
    }

    #[test]
    fn the_table_kinds_are_three_words() {
        assert_eq!(kind_label(TableKind::Local), "local");
        assert_eq!(kind_label(TableKind::Private), "private");
        assert_eq!(kind_label(TableKind::Public), "public");
    }

    #[test]
    fn a_request_has_a_route_a_method_and_a_status_and_nothing_else() {
        let attributes = request_attributes("POST", Some("/api/tables/{id}/bid"), 409);
        assert_eq!(attributes.len(), 3);
        assert_eq!(
            value(&attributes, "http.route").map(ToString::to_string),
            Some("/api/tables/{id}/bid".to_owned())
        );
        assert_eq!(
            value(&attributes, "http.response.status_code").map(ToString::to_string),
            Some("409".to_owned())
        );
        let unmatched = request_attributes("GET", None, 404);
        assert_eq!(
            value(&unmatched, "http.route").map(ToString::to_string),
            Some(UNMATCHED.to_owned())
        );
    }

    /// The route the middleware sees for each request, to prove two identifiers give one route.
    async fn seen_routes(paths: &[&str]) -> Vec<Option<String>> {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let record = seen.clone();
        let app = Router::new()
            .route("/api/tables/{id}", get(|| async { "table" }))
            .layer(from_fn(move |request: Request, next: Next| {
                let record = record.clone();
                async move {
                    record.lock().unwrap().push(
                        request
                            .extensions()
                            .get::<MatchedPath>()
                            .map(|path| path.as_str().to_owned()),
                    );
                    next.run(request).await
                }
            }));
        for path in paths {
            let response = app
                .clone()
                .oneshot(HttpRequest::get(*path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert!(
                response.status() == StatusCode::OK || response.status() == StatusCode::NOT_FOUND
            );
        }
        seen.lock().unwrap().clone()
    }

    #[tokio::test]
    async fn two_tables_are_one_route() {
        let routes = seen_routes(&["/api/tables/7f3a", "/api/tables/c91b"]).await;
        assert_eq!(
            routes,
            vec![Some("/api/tables/{id}".to_owned()); 2],
            "the route is the template, not the path"
        );
    }

    #[tokio::test]
    async fn the_tracking_middleware_leaves_the_response_alone() {
        let app = Router::new()
            .route(
                "/api/tables/{id}",
                get(|| async { (StatusCode::CONFLICT, "no") }),
            )
            .layer(from_fn(track));
        let response = app
            .oneshot(
                HttpRequest::get("/api/tables/1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);
    }
}
