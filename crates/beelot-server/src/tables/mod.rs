//! Tables: the rules are `beelot-table`'s; here are the registry, the codes, the matchmaking and the hand-over of finished
//! matches.

pub mod codes;
pub mod daily;
pub mod finished;
pub mod matchmaking;
pub mod registry;

pub use beelot_table::{
    Action, Actor, BidHint, Connection, Hint, Lobby, NoObserver, Observer, OsRandom, Outcome,
    Refusal, ReviewInput, RngFactory, Seat, SeatKind, Status, Table, TableKind, TableSetup,
    actions, hints, local_seats, messages, reactions, required_name, seats, table, valid_target,
};
pub use registry::{Access, TableHandle, TableRegistry};
