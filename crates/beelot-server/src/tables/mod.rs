//! Tables: the rules are `beelot-table`'s; here are the registry, the codes, the matchmaking and the hand-over of finished
//! matches.

pub mod codes;
pub mod daily;
pub mod finished;
pub mod matchmaking;
pub mod published;
pub mod registry;
pub mod store;
pub mod stream;
pub mod task;

pub use beelot_table::{
    Action, Actor, BidHint, Connection, Entry, Event, Hint, HintInput, Lobby, NoObserver, Observer,
    Origin, OsRandom, Outcome, Refusal, ReviewInput, Seat, SeatKind, SeedSource, Status, Table,
    TableKind, TableSetup, actions, hints, local_seats, messages, reactions, required_name, seats,
    table, valid_target,
};
pub use registry::{Access, TableHandle, TableRegistry};
