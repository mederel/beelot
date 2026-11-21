//! What a table tells whoever runs it, without knowing who: the server counts matches in its metrics.

use super::TableKind;

pub trait Observer: Send + Sync {
    /// A match began at a table of `kind`.
    fn match_started(&self, kind: TableKind);
    /// A match reached its target at a table of `kind`.
    fn match_completed(&self, kind: TableKind);
}

/// Tells nobody.
#[derive(Debug, Clone, Copy, Default)]
pub struct NoObserver;

impl Observer for NoObserver {
    fn match_started(&self, _: TableKind) {}
    fn match_completed(&self, _: TableKind) {}
}
