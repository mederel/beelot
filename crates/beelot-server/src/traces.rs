//! The server's traces, exported through OpenTelemetry (US-156).
//!
//! The spans are made with the OpenTelemetry API directly, each with the few attributes written in this file and no
//! other, so nothing a handler knows (a name, a token, an address, an identifier, a query string) can reach a span. There
//! are three kinds: one server span per request, one child per database call of the repository functions, and one per
//! table action. Until [`enable`] is called, which `main` does when the spans are exported, none is made.

use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::extract::{MatchedPath, Request};
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;
use opentelemetry::propagation::Extractor;
use opentelemetry::trace::{FutureExt as _, SpanKind, Status, TraceContextExt as _, Tracer as _};
use opentelemetry::{Context, KeyValue, global};

use crate::metrics::method_label;

static ENABLED: AtomicBool = AtomicBool::new(false);

/// Called once the tracer provider is installed.
pub fn enable() {
    ENABLED.store(true, Ordering::Relaxed);
}

fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

/// The headers of a request, read by the propagator for a `traceparent`.
struct Headers<'a>(&'a HeaderMap);

impl Extractor for Headers<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|value| value.to_str().ok())
    }

    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(axum::http::HeaderName::as_str).collect()
    }
}

/// The name of a request's span: the method and the route template, or the method alone when no route matched.
pub fn request_span_name(method: &str, route: Option<&str>) -> String {
    match route {
        Some(route) => format!("{} {route}", method_label(method)),
        None => method_label(method).to_owned(),
    }
}

/// The attributes of a request's span when it starts: the method and the route template, never the path as requested.
pub fn request_attributes(method: &str, route: Option<&str>) -> Vec<KeyValue> {
    let mut attributes = vec![KeyValue::new("http.request.method", method_label(method))];
    if let Some(route) = route {
        attributes.push(KeyValue::new("http.route", route.to_owned()));
    }
    attributes
}

/// The attributes of a database call's span.
pub fn database_attributes() -> Vec<KeyValue> {
    vec![KeyValue::new("db.system.name", "mariadb")]
}

/// The attributes of a table action's span.
pub fn table_attributes(kind: &'static str) -> Vec<KeyValue> {
    vec![KeyValue::new("beelot.table.kind", kind)]
}

/// Makes a request's server span, a child of the caller's trace when the request has a `traceparent`, and keeps it current
/// while the request is answered, so the log events and the child spans written meanwhile belong to it.
pub async fn track(request: Request, next: Next) -> Response {
    if !enabled() {
        return next.run(request).await;
    }
    let tracer = global::tracer("beelot");
    let parent = global::get_text_map_propagator(|propagator| {
        propagator.extract(&Headers(request.headers()))
    });
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str().to_owned());
    let span = tracer
        .span_builder(request_span_name(
            request.method().as_str(),
            route.as_deref(),
        ))
        .with_kind(SpanKind::Server)
        .with_attributes(request_attributes(
            request.method().as_str(),
            route.as_deref(),
        ))
        .start_with_context(&tracer, &parent);
    let context = parent.with_span(span);
    let response = next.run(request).with_context(context.clone()).await;
    let status = response.status().as_u16();
    let span = context.span();
    span.set_attribute(KeyValue::new(
        "http.response.status_code",
        i64::from(status),
    ));
    if status >= 500 {
        span.set_status(Status::error("server error"));
    }
    span.end();
    response
}

/// Runs a database call of the repository function `function` in a child span of the current one.
pub async fn db<T>(function: &'static str, work: impl Future<Output = T>) -> T {
    if !enabled() {
        return work.await;
    }
    let tracer = global::tracer("beelot");
    let parent = Context::current();
    let span = tracer
        .span_builder(format!("beelot.db {function}"))
        .with_kind(SpanKind::Client)
        .with_attributes(database_attributes())
        .start_with_context(&tracer, &parent);
    let context = parent.with_span(span);
    let output = work.with_context(context.clone()).await;
    context.span().end();
    output
}

/// Runs a table action in a child span of the current one. `kind` is the table's kind as the metrics name it.
pub fn table_action<T>(kind: &'static str, work: impl FnOnce() -> T) -> T {
    if !enabled() {
        return work();
    }
    let tracer = global::tracer("beelot");
    let parent = Context::current();
    let span = tracer
        .span_builder("beelot.table act")
        .with_kind(SpanKind::Internal)
        .with_attributes(table_attributes(kind))
        .start_with_context(&tracer, &parent);
    let context = parent.with_span(span);
    let output = {
        let _guard = context.clone().attach();
        work()
    };
    context.span().end();
    output
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderValue;
    use opentelemetry::propagation::TextMapPropagator as _;
    use opentelemetry_sdk::propagation::TraceContextPropagator;

    use super::*;

    #[test]
    fn a_span_is_named_by_its_route_template() {
        assert_eq!(
            request_span_name("POST", Some("/api/tables/{id}/bid")),
            "POST /api/tables/{id}/bid"
        );
        assert_eq!(request_span_name("GET", None), "GET");
        assert_eq!(request_span_name("BREW", Some("/x")), "_OTHER /x");
    }

    #[test]
    fn a_span_holds_only_the_attributes_written_here() {
        let keys = |attributes: Vec<KeyValue>| -> Vec<String> {
            attributes
                .into_iter()
                .map(|attribute| attribute.key.to_string())
                .collect()
        };
        assert_eq!(
            keys(request_attributes("GET", Some("/api/version"))),
            ["http.request.method", "http.route"]
        );
        assert_eq!(
            keys(request_attributes("GET", None)),
            ["http.request.method"]
        );
        assert_eq!(keys(database_attributes()), ["db.system.name"]);
        assert_eq!(keys(table_attributes("private")), ["beelot.table.kind"]);
    }

    #[test]
    fn a_traceparent_header_sets_the_parent() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "traceparent",
            HeaderValue::from_static("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"),
        );
        let context = TraceContextPropagator::new().extract(&Headers(&headers));
        let span = context.span();
        let span_context = span.span_context();
        assert!(span_context.is_valid());
        assert_eq!(
            span_context.trace_id().to_string(),
            "4bf92f3577b34da6a3ce929d0e0e4736"
        );
        assert_eq!(span_context.span_id().to_string(), "00f067aa0ba902b7");
    }

    #[test]
    fn a_request_without_traceparent_has_no_parent() {
        let context = TraceContextPropagator::new().extract(&Headers(&HeaderMap::new()));
        assert!(!context.span().span_context().is_valid());
    }

    #[tokio::test]
    async fn nothing_changes_while_the_spans_are_off() {
        assert!(!enabled());
        assert_eq!(db("anything", async { 7 }).await, 7);
        assert_eq!(table_action("local", || 8), 8);
    }
}
