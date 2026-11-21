//! The preset reactions players send at an online table.

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use time::{Duration, OffsetDateTime};

use super::messages as msg;
use crate::Refusal;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TableReaction {
    WellPlayed,
    NiceHand,
    Oops,
    Wow,
    Thinking,
    GoodGame,
}

pub const KEPT_FOR: Duration = Duration::seconds(30);
const MAX_KEPT: usize = 40;
const BURST: usize = 3;
const BURST_WINDOW: Duration = Duration::seconds(10);

/// A reaction sent from the seat at `position`; the sequence orders the reactions of every table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reaction {
    pub sequence: u64,
    pub position: usize,
    pub reaction: TableReaction,
    pub sent_at: OffsetDateTime,
}

/// The reactions recently sent at one table. A reaction is kept for 30 seconds, and a player may send at most 3
/// reactions in 10 seconds.
#[derive(Debug, Default)]
pub struct Reactions {
    sequence: Arc<AtomicU64>,
    kept: VecDeque<Reaction>,
    sent_by_seat: [VecDeque<OffsetDateTime>; 4],
}

impl Reactions {
    pub fn new(sequence: Arc<AtomicU64>) -> Self {
        Self {
            sequence,
            ..Self::default()
        }
    }

    /// Whether the seat may send a reaction now: it may not, once it has sent three in the last ten seconds.
    pub fn check(&mut self, position: usize, now: OffsetDateTime) -> Result<(), Refusal> {
        let sent = &mut self.sent_by_seat[position];
        while sent.front().is_some_and(|&at| at <= now - BURST_WINDOW) {
            sent.pop_front();
        }
        if sent.len() >= BURST {
            return Err(Refusal::conflict("slow-down", msg::SLOW_DOWN));
        }
        Ok(())
    }

    /// The next sequence number of the counter every table shares.
    pub fn next_sequence(&self) -> u64 {
        self.sequence.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// Keeps a reaction that was sent, with the sequence number it was given.
    pub fn insert(
        &mut self,
        position: usize,
        reaction: TableReaction,
        now: OffsetDateTime,
        sequence: u64,
    ) {
        let sent = &mut self.sent_by_seat[position];
        while sent.front().is_some_and(|&at| at <= now - BURST_WINDOW) {
            sent.pop_front();
        }
        sent.push_back(now);
        self.kept.push_back(Reaction {
            sequence,
            position,
            reaction,
            sent_at: now,
        });
        self.prune(now);
    }

    /// Sends a reaction from the seat; returns its sequence.
    pub fn send(
        &mut self,
        position: usize,
        reaction: TableReaction,
        now: OffsetDateTime,
    ) -> Result<u64, Refusal> {
        self.check(position, now)?;
        let sequence = self.next_sequence();
        self.insert(position, reaction, now, sequence);
        Ok(sequence)
    }

    /// Every reaction still kept, oldest first; [`recent`](Self::recent) is the ones of the last [`KEPT_FOR`].
    pub fn kept(&self) -> Vec<Reaction> {
        self.kept.iter().copied().collect()
    }

    /// The reactions sent in the last 30 seconds, oldest first.
    pub fn recent(&self, now: OffsetDateTime) -> Vec<Reaction> {
        self.kept
            .iter()
            .filter(|reaction| reaction.sent_at >= now - KEPT_FOR)
            .copied()
            .collect()
    }

    fn prune(&mut self, now: OffsetDateTime) {
        while self.kept.len() > MAX_KEPT
            || self
                .kept
                .front()
                .is_some_and(|reaction| reaction.sent_at < now - KEPT_FOR)
        {
            self.kept.pop_front();
        }
    }
}

#[cfg(test)]
#[path = "reactions_tests.rs"]
mod tests;
