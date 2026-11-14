//! The server's logs, sent to an OpenTelemetry collector over OTLP (US-154).
//!
//! The export is off unless an OTLP endpoint is set in the standard `OpenTelemetry` variables. A log record holds the
//! time, the severity, the target (as the instrumentation scope) and the `message` of an event of Beelot's own crates,
//! and nothing else: the other fields of an event may hold names, tokens or addresses, so they are never read. The
//! records leave on the SDK's own thread, through a bounded queue, so a collector that does not answer never slows a
//! match.

use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::Context as _;
use opentelemetry::KeyValue;
use opentelemetry::logs::{AnyValue, LogRecord as _, Logger as _, LoggerProvider as _, Severity};
use opentelemetry_otlp::LogExporter;
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::logs::{SdkLogger, SdkLoggerProvider};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;

use crate::logs::{MAX_CHARS, MessageVisitor};
use crate::routes::version::VERSION;

/// The endpoint variables, the one for logs first.
const ENDPOINT_VARIABLES: [&str; 2] = [
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
];
/// The protocol variables, the one for logs first.
const PROTOCOL_VARIABLES: [&str; 2] = [
    "OTEL_EXPORTER_OTLP_LOGS_PROTOCOL",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
];
/// The name the records carry when `OTEL_SERVICE_NAME` is not set.
const DEFAULT_SERVICE_NAME: &str = "beelot";
/// How long the pending records get at shutdown.
const FLUSH_TIMEOUT: Duration = Duration::from_secs(5);

fn value(lookup: &impl Fn(&str) -> Option<String>, name: &str) -> Option<String> {
    lookup(name)
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn first(
    lookup: &impl Fn(&str) -> Option<String>,
    names: &[&'static str],
) -> Option<(&'static str, String)> {
    names
        .iter()
        .find_map(|name| value(lookup, name).map(|value| (*name, value)))
}

/// Whether the logs are exported, from the standard variables read through `lookup`. An endpoint that is not an http or
/// https address, or a protocol other than `http/protobuf`, is refused with the name of the variable.
pub fn export_enabled(lookup: impl Fn(&str) -> Option<String>) -> Result<bool, String> {
    if value(&lookup, "OTEL_SDK_DISABLED").is_some_and(|value| value.eq_ignore_ascii_case("true")) {
        return Ok(false);
    }
    let Some((name, endpoint)) = first(&lookup, &ENDPOINT_VARIABLES) else {
        return Ok(false);
    };
    match url::Url::parse(&endpoint) {
        Ok(url) if matches!(url.scheme(), "http" | "https") && url.host_str().is_some() => {}
        _ => return Err(format!("{name} must be an http or https address")),
    }
    if let Some((name, protocol)) = first(&lookup, &PROTOCOL_VARIABLES)
        && protocol != "http/protobuf"
    {
        return Err(format!(
            "{name} must be http/protobuf, the only protocol Beelot exports with"
        ));
    }
    Ok(true)
}

/// One log record, as it leaves the layer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Record {
    pub at: SystemTime,
    pub level: Level,
    pub target: String,
    pub body: String,
}

/// Where the records go.
pub trait Sink: Send + Sync + 'static {
    fn emit(&self, record: Record);
}

/// The `tracing` layer that hands the events of Beelot's crates to a [`Sink`].
pub struct LogsLayer<K>(K);

impl<K: Sink> LogsLayer<K> {
    pub fn new(sink: K) -> Self {
        Self(sink)
    }
}

impl<S: Subscriber, K: Sink> Layer<S> for LogsLayer<K> {
    fn on_event(&self, event: &Event<'_>, _context: Context<'_, S>) {
        let metadata = event.metadata();
        if !metadata.target().starts_with("beelot") {
            return;
        }
        let mut visitor = MessageVisitor(None);
        event.record(&mut visitor);
        if let Some(message) = visitor.0 {
            self.0.emit(Record {
                at: SystemTime::now(),
                level: *metadata.level(),
                target: metadata.target().to_owned(),
                body: message.chars().take(MAX_CHARS).collect(),
            });
        }
    }
}

/// The OpenTelemetry severity of a `tracing` level.
pub fn severity(level: Level) -> (Severity, &'static str) {
    match level {
        Level::TRACE => (Severity::Trace, "TRACE"),
        Level::DEBUG => (Severity::Debug, "DEBUG"),
        Level::INFO => (Severity::Info, "INFO"),
        Level::WARN => (Severity::Warn, "WARN"),
        Level::ERROR => (Severity::Error, "ERROR"),
    }
}

/// The sink that emits OpenTelemetry log records.
pub struct OtelSink(SdkLogger);

impl Sink for OtelSink {
    fn emit(&self, record: Record) {
        let (number, text) = severity(record.level);
        let mut log = self.0.create_log_record();
        log.set_timestamp(record.at);
        log.set_observed_timestamp(record.at);
        log.set_severity_number(number);
        log.set_severity_text(text);
        log.set_target(record.target);
        log.set_body(AnyValue::from(record.body));
        self.0.emit(log);
    }
}

/// The running export: [`Telemetry::shutdown`] sends what is pending.
pub struct Telemetry(Arc<SdkLoggerProvider>);

impl Telemetry {
    /// Sends the pending records, for at most five seconds. It blocks: call it off the async threads.
    pub fn shutdown(&self) {
        if let Err(error) = self.0.shutdown_with_timeout(FLUSH_TIMEOUT) {
            tracing::warn!("the last logs could not be sent: {error}");
        }
    }
}

/// Starts the export when the standard variables ask for it: the handle to stop it and the layer to install. `None` when
/// they do not, and an error naming the variable when they are wrong.
pub fn start() -> anyhow::Result<Option<(Telemetry, LogsLayer<OtelSink>)>> {
    let lookup = |name: &str| std::env::var(name).ok();
    if !export_enabled(lookup).map_err(anyhow::Error::msg)? {
        return Ok(None);
    }
    // The blocking HTTP client of the exporter cannot be built on an async runtime thread, so it is built on its own.
    let provider = std::thread::spawn(build_provider)
        .join()
        .map_err(|_| anyhow::anyhow!("the OpenTelemetry exporter could not be built"))??;
    let logger = provider.logger("beelot");
    Ok(Some((
        Telemetry(Arc::new(provider)),
        LogsLayer::new(OtelSink(logger)),
    )))
}

fn build_provider() -> anyhow::Result<SdkLoggerProvider> {
    // The endpoint, the headers and the timeout come from the standard variables, which the exporter reads itself.
    let exporter = LogExporter::builder().with_http().build().context(
        "cannot set up the OpenTelemetry log exporter (see the OTEL_EXPORTER_OTLP_* variables)",
    )?;
    let mut resource = Resource::builder().with_attributes([
        KeyValue::new("service.version", VERSION),
        KeyValue::new("service.instance.id", uuid::Uuid::new_v4().to_string()),
    ]);
    if std::env::var_os("OTEL_SERVICE_NAME").is_none() {
        resource = resource.with_service_name(DEFAULT_SERVICE_NAME);
    }
    Ok(SdkLoggerProvider::builder()
        .with_resource(resource.build())
        .with_batch_exporter(exporter)
        .build())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use tracing_subscriber::layer::SubscriberExt;

    use super::*;

    fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect();
        move |name| map.get(name).cloned()
    }

    #[test]
    fn nothing_is_exported_without_an_endpoint() {
        assert_eq!(export_enabled(env(&[])), Ok(false));
        assert_eq!(
            export_enabled(env(&[("OTEL_EXPORTER_OTLP_ENDPOINT", "  ")])),
            Ok(false)
        );
    }

    #[test]
    fn an_endpoint_turns_the_export_on_and_the_sdk_switch_turns_it_off() {
        let endpoint = ("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318");
        assert_eq!(export_enabled(env(&[endpoint])), Ok(true));
        assert_eq!(
            export_enabled(env(&[(
                "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
                "https://logs.example.org/v1/logs"
            )])),
            Ok(true)
        );
        assert_eq!(
            export_enabled(env(&[endpoint, ("OTEL_SDK_DISABLED", "TRUE")])),
            Ok(false)
        );
    }

    #[test]
    fn a_bad_endpoint_is_refused_by_name() {
        let error =
            export_enabled(env(&[("OTEL_EXPORTER_OTLP_ENDPOINT", "collector")])).unwrap_err();
        assert!(error.starts_with("OTEL_EXPORTER_OTLP_ENDPOINT "), "{error}");
        let error = export_enabled(env(&[
            ("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318"),
            ("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "ftp://collector"),
        ]))
        .unwrap_err();
        assert!(
            error.starts_with("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT "),
            "{error}"
        );
    }

    #[test]
    fn only_the_http_protobuf_protocol_is_accepted() {
        let endpoint = ("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318");
        assert_eq!(
            export_enabled(env(&[
                endpoint,
                ("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
            ])),
            Ok(true)
        );
        let error =
            export_enabled(env(&[endpoint, ("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc")])).unwrap_err();
        assert!(error.starts_with("OTEL_EXPORTER_OTLP_PROTOCOL "), "{error}");
    }

    #[test]
    fn levels_map_to_severities() {
        assert_eq!(severity(Level::WARN), (Severity::Warn, "WARN"));
        assert_eq!(severity(Level::ERROR).0, Severity::Error);
        assert_eq!(severity(Level::INFO).1, "INFO");
    }

    #[derive(Clone, Default)]
    struct Records(Arc<Mutex<Vec<Record>>>);

    impl Sink for Records {
        fn emit(&self, record: Record) {
            self.0.lock().unwrap().push(record);
        }
    }

    fn capture(emit: impl FnOnce()) -> Vec<Record> {
        let records = Records::default();
        let subscriber = tracing_subscriber::registry().with(LogsLayer::new(records.clone()));
        tracing::subscriber::with_default(subscriber, emit);
        records.0.lock().unwrap().clone()
    }

    #[test]
    fn a_warning_of_beelot_is_exported_with_its_severity_target_and_message() {
        let records =
            capture(|| tracing::warn!(target: "beelot_server::history", "could not record"));
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].level, Level::WARN);
        assert_eq!(records[0].target, "beelot_server::history");
        assert_eq!(records[0].body, "could not record");
    }

    #[test]
    fn the_other_fields_of_an_event_are_never_exported() {
        let records = capture(|| {
            tracing::error!(target: "beelot_server::test", player = "Alice", token = "secret-token", "a fixed message");
        });
        assert_eq!(records.len(), 1);
        let text = format!("{:?}", records[0]);
        assert!(
            !text.contains("Alice") && !text.contains("secret-token"),
            "{text}"
        );
        assert_eq!(records[0].body, "a fixed message");
    }

    #[test]
    fn the_events_of_other_crates_are_not_exported() {
        let records = capture(|| {
            tracing::error!(target: "sqlx::query", "slow query");
            tracing::warn!(target: "opentelemetry_sdk", "export failed");
        });
        assert!(records.is_empty());
    }

    #[test]
    fn a_long_message_is_cut() {
        let records =
            capture(|| tracing::info!(target: "beelot_server", "{}", "é".repeat(MAX_CHARS + 50)));
        assert_eq!(records[0].body.chars().count(), MAX_CHARS);
    }
}
