//! What happens at a table, as events (ADR-006, US-166). A command is checked and turned into events; the events are the
//! only thing that changes a table, so a table can be rebuilt from its origin and its events.

use beelot_game::bidding::AuctionDecision;
use beelot_game::{Card, Difficulty, KlaverjasRules};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use super::reactions::TableReaction;
use super::seats::{Lobby, TableKind};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Event {
    /// A player sat down.
    Joined {
        name: String,
        account: Option<Uuid>,
    },
    /// A player left a waiting table, or a local device closed its table.
    Left {
        seat: usize,
    },
    SeatChosen {
        seat: usize,
        to: usize,
    },
    ReadySet {
        seat: usize,
        ready: bool,
    },
    /// The owner started the match, with the empty seats filled by bots or not.
    Started {
        seat: usize,
        fill_with_bots: bool,
    },
    /// The wait of a public table is over: bots took its empty seats.
    BotsFilled,
    SettingsChanged {
        seat: usize,
        announcements: Option<bool>,
        all_trumps: Option<bool>,
        /// The Klaverjas rule set (US-214); absent from the events recorded before it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        klaverjas_rules: Option<KlaverjasRules>,
        turn_timer: Option<u32>,
        target: Option<i32>,
    },
    SpectatorsSet {
        seat: usize,
        allowed: bool,
    },
    Disconnected {
        seat: usize,
    },
    Reconnected {
        seat: usize,
    },
    /// The seats disconnected for at least `timeout_ms` were handed to bots.
    BotsTookOver {
        timeout_ms: u64,
    },
    /// A deleted account's seats left the table or went to a bot.
    AccountReleased {
        account: Uuid,
    },
    /// A spectator's stream opened or closed.
    WatcherChanged {
        joined: bool,
    },
    /// A match began, from a score of zero.
    MatchBegan {
        match_id: Uuid,
    },
    /// A deal, shuffled from `seed` or, from the pile, gathered from the last round's tricks.
    Dealt {
        dealer: usize,
        seed: i64,
        from_pile: bool,
    },
    Called {
        seat: usize,
        decision: AuctionDecision,
        by_bot: bool,
    },
    CardPlayed {
        seat: usize,
        card: Card,
        declare: bool,
        by_bot: bool,
    },
    TrickCollected,
    /// The solo player took their last card back.
    CardTakenBack,
    RematchAsked {
        seat: usize,
    },
    /// A finished match started again, from a score of zero.
    Rematched {
        match_id: Uuid,
    },
    Reacted {
        seat: usize,
        reaction: TableReaction,
        sequence: u64,
    },
}

/// An event with when it happened and the version of the table it belongs to: the events of one command share a version.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    pub version: u64,
    #[serde(with = "time::serde::rfc3339")]
    pub at: OffsetDateTime,
    pub event: Event,
}

/// What a table is made of before its first event: with its events, everything it is.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Origin {
    pub id: Uuid,
    pub kind: TableKind,
    pub difficulty: Option<Difficulty>,
    pub invitation_code: Option<String>,
    pub lobby: Lobby,
    /// The day of the daily deal this table plays (US-150).
    pub daily: Option<time::Date>,
    /// The tutorial this table plays (US-199); the tables saved before it read as none.
    #[serde(default)]
    pub tutorial: Option<crate::tutorial::Tutorial>,
}
