//! Which tables each signed-in account sits at, kept as seats are taken and left so that no search asks every table.

use std::collections::HashSet;

use dashmap::DashMap;
use uuid::Uuid;

/// An index from an account to the tables where it holds a seat.
///
/// Each table's task keeps its own entry up to date after every change (`set`) and clears it when it ends (`clear`), so the
/// index equals what the tables hold, up to the change a task is publishing at that moment.
#[derive(Debug, Default)]
pub struct AccountTables {
    /// The tables of each account.
    by_account: DashMap<Uuid, HashSet<Uuid>>,
    /// The accounts last recorded for each table: what `set` compares with, and what `clear` removes.
    by_table: DashMap<Uuid, Vec<Uuid>>,
}

impl AccountTables {
    /// Records that `table` now seats exactly `accounts` (sorted, without duplicates).
    pub(super) fn set(&self, table: Uuid, accounts: Vec<Uuid>) {
        // The table's entry stays locked while the other map changes: the lock order is always table, then account.
        let mut recorded = self.by_table.entry(table).or_default();
        for gone in recorded
            .iter()
            .filter(|account| accounts.binary_search(account).is_err())
        {
            self.leave(*gone, table);
        }
        for joined in accounts
            .iter()
            .filter(|account| recorded.binary_search(account).is_err())
        {
            self.by_account.entry(*joined).or_default().insert(table);
        }
        *recorded = accounts;
    }

    /// Forgets `table`: it has ended.
    pub(super) fn clear(&self, table: Uuid) {
        if let Some((_, accounts)) = self.by_table.remove(&table) {
            for account in accounts {
                self.leave(account, table);
            }
        }
    }

    fn leave(&self, account: Uuid, table: Uuid) {
        self.by_account.remove_if_mut(&account, |_, tables| {
            tables.remove(&table);
            tables.is_empty()
        });
    }

    /// The tables where `account` holds a seat.
    pub fn of(&self, account: Uuid) -> Vec<Uuid> {
        self.by_account
            .get(&account)
            .map(|tables| tables.iter().copied().collect())
            .unwrap_or_default()
    }

    /// The number of accounts with a seat somewhere.
    #[cfg(test)]
    pub(super) fn accounts(&self) -> usize {
        self.by_account.len()
    }
}
