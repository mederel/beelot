//! How many tables of each kind are in memory, kept as counters so that no read walks the registry.

use std::sync::atomic::{AtomicUsize, Ordering};

use super::TableKind;

/// One counter per kind, moved when a table enters the registry's map and when it leaves it.
#[derive(Debug, Default)]
pub struct TableCounts {
    local: AtomicUsize,
    private: AtomicUsize,
    public: AtomicUsize,
    /// The private and public ones together: the gate of the online cap, moved with the kind's own.
    online: AtomicUsize,
}

impl TableCounts {
    fn counter(&self, kind: TableKind) -> &AtomicUsize {
        match kind {
            TableKind::Local => &self.local,
            TableKind::Private => &self.private,
            TableKind::Public => &self.public,
        }
    }

    fn gate(&self, kind: TableKind) -> &AtomicUsize {
        match kind {
            TableKind::Local => &self.local,
            TableKind::Private | TableKind::Public => &self.online,
        }
    }

    /// Takes a place for a table of `kind` if fewer than `max` of its class (local, or online) are counted: the check
    /// and the increment are one atomic step, so concurrent creations never pass `max` (US-181).
    #[allow(
        deprecated,
        reason = "`try_update` needs a newer Rust than the project's"
    )]
    pub(super) fn reserve(&self, kind: TableKind, max: usize) -> bool {
        let taken = self
            .gate(kind)
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |held| {
                (held < max).then_some(held + 1)
            })
            .is_ok();
        if taken && kind != TableKind::Local {
            self.counter(kind).fetch_add(1, Ordering::SeqCst);
        }
        taken
    }

    /// Counts a table that is restored, whatever the caps.
    pub(super) fn added(&self, kind: TableKind) {
        self.gate(kind).fetch_add(1, Ordering::SeqCst);
        if kind != TableKind::Local {
            self.counter(kind).fetch_add(1, Ordering::SeqCst);
        }
    }

    pub(super) fn removed(&self, kind: TableKind) {
        self.gate(kind).fetch_sub(1, Ordering::SeqCst);
        if kind != TableKind::Local {
            self.counter(kind).fetch_sub(1, Ordering::SeqCst);
        }
    }

    pub fn of(&self, kind: TableKind) -> usize {
        self.counter(kind).load(Ordering::Relaxed)
    }

    /// The local tables, and the online (private and public) ones.
    pub fn local_and_online(&self) -> (usize, usize) {
        (
            self.local.load(Ordering::Relaxed),
            self.online.load(Ordering::Relaxed),
        )
    }
}

/// A place taken for a table that is not in the registry yet: given back when dropped, unless the table was inserted
/// (its `Removal` gives the place back then), so a creation that fails or panics leaks none.
pub(super) struct Place {
    pub(super) counts: std::sync::Arc<TableCounts>,
    pub(super) kind: TableKind,
    pub(super) kept: bool,
}

impl Drop for Place {
    fn drop(&mut self) {
        if !self.kept {
            self.counts.removed(self.kind);
        }
    }
}
