//! How many tables of each kind are in memory, kept as counters so that no read walks the registry.

use std::sync::atomic::{AtomicUsize, Ordering};

use super::TableKind;

/// One counter per kind, moved when a table enters the registry's map and when it leaves it.
#[derive(Debug, Default)]
pub struct TableCounts {
    local: AtomicUsize,
    private: AtomicUsize,
    public: AtomicUsize,
}

impl TableCounts {
    fn counter(&self, kind: TableKind) -> &AtomicUsize {
        match kind {
            TableKind::Local => &self.local,
            TableKind::Private => &self.private,
            TableKind::Public => &self.public,
        }
    }

    pub(super) fn added(&self, kind: TableKind) {
        self.counter(kind).fetch_add(1, Ordering::Relaxed);
    }

    pub(super) fn removed(&self, kind: TableKind) {
        self.counter(kind).fetch_sub(1, Ordering::Relaxed);
    }

    pub fn of(&self, kind: TableKind) -> usize {
        self.counter(kind).load(Ordering::Relaxed)
    }

    /// The local tables, and the online (private and public) ones.
    pub fn local_and_online(&self) -> (usize, usize) {
        (
            self.of(TableKind::Local),
            self.of(TableKind::Private) + self.of(TableKind::Public),
        )
    }
}
