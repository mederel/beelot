//! The last warnings and errors of the log, for the operator's status page (US-152).
//!
//! Only the time, the level and the `message` text of an event are kept, and only of events from Beelot's own crates.
//! The other fields of an event may hold names, tokens or addresses, so they are dropped, and so is any text past
//! 200 characters.

use std::collections::VecDeque;
use std::fmt::Debug;
use std::sync::{Arc, Mutex};

use time::OffsetDateTime;
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;

/// How many entries the page shows: the most recent ones.
pub const KEPT: usize = 20;
/// The longest message kept, in characters.
pub const MAX_CHARS: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogEntry {
    pub at: OffsetDateTime,
    pub level: Level,
    pub message: String,
}

/// The entries kept in memory, the newest last. Shared between the log layer and the status page.
#[derive(Debug, Default)]
pub struct ErrorLog {
    entries: Mutex<VecDeque<LogEntry>>,
}

impl ErrorLog {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// The layer that feeds this log; install it in the subscriber.
    pub fn layer(self: &Arc<Self>) -> ErrorLogLayer {
        ErrorLogLayer(self.clone())
    }

    /// Keeps an entry, dropping the oldest when the log is full. Entries that are not warnings or errors of Beelot are
    /// refused.
    pub fn record(&self, at: OffsetDateTime, level: Level, target: &str, message: String) {
        if level > Level::WARN || !target.starts_with("beelot") {
            return;
        }
        let message: String = message.chars().take(MAX_CHARS).collect();
        let mut entries = self.entries.lock().unwrap();
        if entries.len() == KEPT {
            entries.pop_front();
        }
        entries.push_back(LogEntry { at, level, message });
    }

    /// The kept entries, the most recent first.
    pub fn recent(&self) -> Vec<LogEntry> {
        self.entries.lock().unwrap().iter().rev().cloned().collect()
    }
}

/// The `tracing` layer that feeds an [`ErrorLog`].
pub struct ErrorLogLayer(Arc<ErrorLog>);

impl<S: Subscriber> Layer<S> for ErrorLogLayer {
    fn on_event(&self, event: &Event<'_>, _context: Context<'_, S>) {
        let metadata = event.metadata();
        if *metadata.level() > Level::WARN {
            return;
        }
        let mut visitor = MessageVisitor(None);
        event.record(&mut visitor);
        if let Some(message) = visitor.0 {
            self.0.record(
                OffsetDateTime::now_utc(),
                *metadata.level(),
                metadata.target(),
                message,
            );
        }
    }
}

/// Reads the `message` field only.
pub(crate) struct MessageVisitor(pub(crate) Option<String>);

impl Visit for MessageVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.0 = Some(value.to_owned());
        }
    }

    fn record_debug(&mut self, field: &Field, value: &dyn Debug) {
        if field.name() == "message" {
            self.0 = Some(format!("{value:?}"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    const NOW: OffsetDateTime = datetime!(2026-11-14 06:00 UTC);

    #[test]
    fn only_warnings_and_errors_of_beelot_are_kept() {
        let log = ErrorLog::new();
        log.record(NOW, Level::INFO, "beelot_server", "listening".into());
        log.record(NOW, Level::WARN, "sqlx::query", "slow query".into());
        log.record(
            NOW,
            Level::WARN,
            "beelot_server::history",
            "could not record".into(),
        );
        assert_eq!(log.recent().len(), 1);
        assert_eq!(log.recent()[0].level, Level::WARN);
    }

    #[test]
    fn the_log_keeps_the_last_entries_newest_first() {
        let log = ErrorLog::new();
        for index in 0..KEPT + 5 {
            log.record(NOW, Level::ERROR, "beelot_server", format!("error {index}"));
        }
        let recent = log.recent();
        assert_eq!(recent.len(), KEPT);
        assert_eq!(recent[0].message, format!("error {}", KEPT + 4));
        assert_eq!(recent[KEPT - 1].message, "error 5");
    }

    #[test]
    fn a_long_message_is_cut() {
        let log = ErrorLog::new();
        log.record(
            NOW,
            Level::ERROR,
            "beelot_server",
            "é".repeat(MAX_CHARS + 50),
        );
        assert_eq!(log.recent()[0].message.chars().count(), MAX_CHARS);
    }

    #[test]
    fn the_message_field_is_the_only_text_kept() {
        use tracing_subscriber::layer::SubscriberExt;

        let log = ErrorLog::new();
        let subscriber = tracing_subscriber::registry().with(log.layer());
        tracing::subscriber::with_default(subscriber, || {
            tracing::warn!(target: "beelot_server::test", name = "Alice", token = "secret-token", "a fixed message");
        });
        let recent = log.recent();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].message, "a fixed message");
    }
}
