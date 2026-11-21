//! Where a finished match goes: the history. The data of a match is the table crate's.

use futures_util::future::BoxFuture;

pub use beelot_table::finished::{DELETED_PLAYER, FinishedMatch, FinishedSeat, Mode};

/// Where finished matches go: the history, once it exists.
pub trait MatchSink: Send + Sync {
    /// Keeps the match; a failure is the sink's to log, never the caller's.
    fn record(&self, finished: FinishedMatch) -> BoxFuture<'_, ()>;
}

/// Forgets every match.
#[derive(Debug, Default)]
pub struct NoopSink;

impl MatchSink for NoopSink {
    fn record(&self, _: FinishedMatch) -> BoxFuture<'_, ()> {
        Box::pin(async {})
    }
}
