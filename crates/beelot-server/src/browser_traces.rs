//! The web client's spans (US-158): the browser sends the spans of its calls to `POST /api/telemetry/spans`, and this
//! module checks each field, keeps only the ones written below and hands them to a tracer whose resource is
//! `beelot-web`. The browser never knows the collector. Everything that is not on the lists is dropped, so a client that
//! sends more (or a hand-made request) cannot put anything else in a span.

use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::routing::post;
use opentelemetry::trace::{Span as _, SpanId, SpanKind, Status, TraceId, Tracer as _};
use opentelemetry::{Context, KeyValue};
use opentelemetry_sdk::trace::{IdGenerator, RandomIdGenerator, SdkTracer};
use serde::Deserialize;

use crate::app::AppState;
use crate::config::Config;
use crate::error::AppError;
use crate::metrics::method_label;
use crate::routes::ApiJson;

/// The most a request may hold: sixty-four KiB, and a hundred spans.
const MAX_BODY: usize = 64 * 1024;
const MAX_SPANS: usize = 100;
const MAX_ROUTE: usize = 64;
/// A span longer than an hour, or more than a day away from now, is a clock gone wrong or a made-up one.
const MAX_DURATION_MS: u64 = 3_600_000;
const MAX_SKEW_MS: u64 = 86_400_000;

static TRACER: OnceLock<SdkTracer> = OnceLock::new();

thread_local! {
    /// The identifiers of the span being built, set by [`emit`] around the call that builds it.
    static NEXT_IDS: std::cell::Cell<Option<([u8; 16], [u8; 8])>> = const { std::cell::Cell::new(None) };
}

/// The identifier generator of the `beelot-web` provider: the client chose its spans' identifiers, so that the server's span
/// of the same call, which has its `traceparent`, is their child. Without identifiers set it is the random generator.
#[derive(Debug, Default)]
pub struct ClientIds(RandomIdGenerator);

impl IdGenerator for ClientIds {
    fn new_trace_id(&self) -> TraceId {
        match NEXT_IDS.get() {
            Some((trace_id, _)) => TraceId::from_bytes(trace_id),
            None => self.0.new_trace_id(),
        }
    }

    fn new_span_id(&self) -> SpanId {
        match NEXT_IDS.get() {
            Some((_, span_id)) => SpanId::from_bytes(span_id),
            None => self.0.new_span_id(),
        }
    }
}

/// Whether `BEELOT_BROWSER_TRACES` asks for it, read the way the configuration reads a flag.
pub fn requested(lookup: impl Fn(&str) -> Option<String>) -> bool {
    matches!(
        lookup("BEELOT_BROWSER_TRACES")
            .map(|value| value.trim().to_ascii_lowercase())
            .as_deref(),
        Some("true" | "1" | "yes")
    )
}

/// Called once the `beelot-web` tracer exists.
pub fn install(tracer: SdkTracer) {
    let _ = TRACER.set(tracer);
}

/// Whether the client's spans are taken: the operator asked for it and the spans are exported.
pub fn active(config: &Config) -> bool {
    config.browser_traces && TRACER.get().is_some()
}

pub fn routes() -> Router<AppState> {
    Router::new().route(
        "/api/telemetry/spans",
        post(receive).layer(DefaultBodyLimit::max(MAX_BODY)),
    )
}

#[derive(Debug, Deserialize)]
struct Batch {
    spans: Vec<Incoming>,
}

/// A span as the browser sends it. A field that is not listed here is ignored when the body is read.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Incoming {
    kind: String,
    trace_id: String,
    span_id: String,
    #[serde(default)]
    method: String,
    #[serde(default)]
    route: String,
    #[serde(default)]
    error_type: String,
    start_ms: u64,
    end_ms: u64,
    #[serde(default)]
    status: u16,
    #[serde(default)]
    failed: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Kind {
    Fetch,
    WebSocket,
    Error(String),
}

/// A span that passed every check.
#[derive(Debug, PartialEq, Eq)]
pub struct Checked {
    pub kind: Kind,
    pub trace_id: [u8; 16],
    pub span_id: [u8; 8],
    pub method: &'static str,
    pub route: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub status: u16,
    pub failed: bool,
}

fn hex<const N: usize>(text: &str) -> Option<[u8; N]> {
    if text.len() != N * 2
        || !text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return None;
    }
    let mut bytes = [0u8; N];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[index * 2..index * 2 + 2], 16).ok()?;
    }
    (bytes != [0u8; N]).then_some(bytes)
}

/// The route as the server keeps it: it starts with a slash, holds only letters, `_`, `-`, `{` and `}`, and any segment
/// with a digit or more than twenty-four characters is `{id}`, whatever the client already did.
pub fn route(route: &str) -> Option<String> {
    let route = route.split(['?', '#']).next().unwrap_or("");
    if !route.starts_with('/')
        || route.len() > MAX_ROUTE
        || !route
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'_' | b'-' | b'{' | b'}'))
    {
        return None;
    }
    Some(
        route
            .split('/')
            .map(|segment| {
                if segment == "{id}"
                    || (!segment.starts_with('{')
                        && !segment.contains(['{', '}'])
                        && segment.len() <= 24
                        && !segment.bytes().any(|b| b.is_ascii_digit()))
                {
                    segment
                } else {
                    "{id}"
                }
            })
            .collect::<Vec<_>>()
            .join("/"),
    )
}

fn error_type(text: &str) -> Option<String> {
    (!text.is_empty() && text.len() <= 40 && text.bytes().all(|b| b.is_ascii_alphabetic()))
        .then(|| text.to_owned())
}

/// Checks one span against the lists; `None` drops it.
pub fn check(incoming: Incoming, now_ms: u64) -> Option<Checked> {
    let trace_id = hex::<16>(&incoming.trace_id)?;
    let span_id = hex::<8>(&incoming.span_id)?;
    if incoming.end_ms < incoming.start_ms
        || incoming.end_ms - incoming.start_ms > MAX_DURATION_MS
        || incoming.start_ms.abs_diff(now_ms) > MAX_SKEW_MS
    {
        return None;
    }
    let (kind, method, route) = match incoming.kind.as_str() {
        "fetch" => (
            Kind::Fetch,
            method_label(&incoming.method),
            route(&incoming.route)?,
        ),
        "websocket" => (Kind::WebSocket, "GET", route(&incoming.route)?),
        "error" => (
            Kind::Error(error_type(&incoming.error_type)?),
            "GET",
            String::new(),
        ),
        _ => return None,
    };
    Some(Checked {
        kind,
        trace_id,
        span_id,
        method,
        route,
        start_ms: incoming.start_ms,
        end_ms: incoming.end_ms,
        status: if incoming.status <= 599 {
            incoming.status
        } else {
            0
        },
        failed: incoming.failed,
    })
}

fn at(ms: u64) -> SystemTime {
    UNIX_EPOCH + Duration::from_millis(ms)
}

/// The span's name and its attributes: the lists, and nothing else.
pub fn describe(span: &Checked) -> (String, Vec<KeyValue>) {
    match &span.kind {
        Kind::Fetch => {
            let mut attributes = vec![
                KeyValue::new("http.request.method", span.method),
                KeyValue::new("http.route", span.route.clone()),
            ];
            if span.status != 0 {
                attributes.push(KeyValue::new(
                    "http.response.status_code",
                    i64::from(span.status),
                ));
            }
            if span.failed {
                attributes.push(KeyValue::new("beelot.client.error", true));
            }
            (format!("{} {}", span.method, span.route), attributes)
        }
        Kind::WebSocket => {
            let mut attributes = vec![KeyValue::new("http.route", span.route.clone())];
            if span.failed {
                attributes.push(KeyValue::new("beelot.client.error", true));
            }
            (format!("websocket {}", span.route), attributes)
        }
        Kind::Error(_) => ("browser error".to_owned(), Vec::new()),
    }
}

fn emit(tracer: &SdkTracer, span: &Checked) {
    let (name, attributes) = describe(span);
    let builder = tracer
        .span_builder(name)
        .with_kind(match span.kind {
            Kind::Fetch | Kind::WebSocket => SpanKind::Client,
            Kind::Error(_) => SpanKind::Internal,
        })
        .with_start_time(at(span.start_ms))
        .with_attributes(attributes);
    // A root: the current context holds the request that carries these spans, which is not their parent. Its identifiers
    // are the client's: the generator of the `beelot-web` provider hands them out while the span is built, on this thread.
    NEXT_IDS.set(Some((span.trace_id, span.span_id)));
    let mut made = tracer.build_with_context(builder, &Context::new());
    NEXT_IDS.set(None);
    if let Kind::Error(kind) = &span.kind {
        made.add_event(
            "exception",
            vec![KeyValue::new("exception.type", kind.clone())],
        );
        made.set_status(Status::error("uncaught error"));
    } else if span.failed {
        made.set_status(Status::error("failed call"));
    }
    made.end_with_timestamp(at(span.end_ms));
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

async fn receive(
    State(state): State<AppState>,
    ApiJson(batch): ApiJson<Batch>,
) -> Result<StatusCode, AppError> {
    let tracer = match TRACER.get() {
        Some(tracer) if state.config.browser_traces => tracer,
        _ => return Err(AppError::NotFound),
    };
    let now = now_ms();
    for incoming in batch.spans.into_iter().take(MAX_SPANS) {
        if let Some(span) = check(incoming, now) {
            emit(tracer, &span);
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_800_000_000_000;

    fn incoming() -> Incoming {
        Incoming {
            kind: "fetch".into(),
            trace_id: "ab".repeat(16),
            span_id: "cd".repeat(8),
            method: "POST".into(),
            route: "/api/tables/{id}/bid".into(),
            error_type: String::new(),
            start_ms: NOW,
            end_ms: NOW + 40,
            status: 200,
            failed: false,
        }
    }

    #[test]
    fn a_good_span_is_kept() {
        let span = check(incoming(), NOW).unwrap();
        assert_eq!(span.method, "POST");
        assert_eq!(span.route, "/api/tables/{id}/bid");
        assert_eq!(span.trace_id, [0xab; 16]);
    }

    #[test]
    fn a_route_is_rewritten_whatever_the_client_did() {
        assert_eq!(
            route("/api/tables/8f3a2c1d/bid?token=x").as_deref(),
            Some("/api/tables/{id}/bid")
        );
        assert_eq!(
            route("/api/friends/ana").as_deref(),
            Some("/api/friends/ana")
        );
        assert_eq!(route("/api/{secret}/x").as_deref(), Some("/api/{id}/x"));
        assert_eq!(route("api/x"), None);
        assert_eq!(route("/api/x y"), None);
        assert_eq!(route(&format!("/{}", "a".repeat(80))), None);
    }

    #[test]
    fn a_span_with_a_wrong_field_is_dropped() {
        let mut bad = incoming();
        bad.trace_id = "AB".repeat(16);
        assert!(check(bad, NOW).is_none());
        let mut zero = incoming();
        zero.span_id = "00".repeat(8);
        assert!(check(zero, NOW).is_none());
        let mut backwards = incoming();
        backwards.end_ms = NOW - 1;
        assert!(check(backwards, NOW).is_none());
        let mut long = incoming();
        long.end_ms = NOW + MAX_DURATION_MS + 1;
        assert!(check(long, NOW).is_none());
        let mut old = incoming();
        old.start_ms = NOW - MAX_SKEW_MS - 1;
        old.end_ms = old.start_ms;
        assert!(check(old, NOW).is_none());
        let mut kind = incoming();
        kind.kind = "navigation".into();
        assert!(check(kind, NOW).is_none());
    }

    #[test]
    fn an_unknown_method_is_other_and_a_wild_status_is_zero() {
        let mut odd = incoming();
        odd.method = "BREW".into();
        odd.status = 9999;
        let span = check(odd, NOW).unwrap();
        assert_eq!(span.method, "_OTHER");
        assert_eq!(span.status, 0);
    }

    #[test]
    fn an_error_keeps_only_the_name_of_its_type() {
        let mut error = incoming();
        error.kind = "error".into();
        error.error_type = "TypeError".into();
        assert_eq!(
            check(error, NOW).unwrap().kind,
            Kind::Error("TypeError".into())
        );
        let mut message = incoming();
        message.kind = "error".into();
        message.error_type = "Cannot read secret of 1234".into();
        assert!(check(message, NOW).is_none());
    }

    #[test]
    fn a_span_has_only_the_attributes_listed() {
        let keys = |span: &Checked| -> Vec<String> {
            describe(span)
                .1
                .into_iter()
                .map(|a| a.key.to_string())
                .collect()
        };
        let mut failed = incoming();
        failed.failed = true;
        assert_eq!(
            keys(&check(failed, NOW).unwrap()),
            [
                "http.request.method",
                "http.route",
                "http.response.status_code",
                "beelot.client.error"
            ]
        );
        let mut error = incoming();
        error.kind = "error".into();
        error.error_type = "Error".into();
        assert!(keys(&check(error, NOW).unwrap()).is_empty());
    }

    #[test]
    fn a_body_with_more_fields_is_read_without_them() {
        let body = r#"{"spans":[{"kind":"fetch","traceId":"abababababababababababababababab","spanId":"cdcdcdcdcdcdcdcd","method":"GET","route":"/api/x","startMs":1,"endMs":2,"status":200,"failed":false,"userName":"Ana","url":"/api/x?token=1"}]}"#;
        let batch: Batch = serde_json::from_str(body).unwrap();
        assert_eq!(batch.spans.len(), 1);
    }

    #[test]
    fn the_generator_hands_out_the_clients_identifiers_while_they_are_set() {
        let ids = ClientIds::default();
        NEXT_IDS.set(Some(([7; 16], [9; 8])));
        assert_eq!(ids.new_trace_id(), TraceId::from_bytes([7; 16]));
        assert_eq!(ids.new_span_id(), SpanId::from_bytes([9; 8]));
        NEXT_IDS.set(None);
        assert_ne!(ids.new_trace_id(), TraceId::from_bytes([7; 16]));
    }

    #[test]
    fn the_flag_reads_like_the_others() {
        let with = |value: &'static str| requested(|_| Some(value.to_owned()));
        assert!(with("true") && with("1") && with(" Yes "));
        assert!(!with("false") && !with("") && !with("maybe"));
        assert!(!requested(|_| None));
    }
}
