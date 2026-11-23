//! The rules of a Beelot table: who sits where, the auction and the card play, the bots' turns, undo and rematch, the
//! match score and what a player sees as a hint. Solo, pass-and-play and online tables are all this one model. No I/O,
//! no async and no HTTP: the server wraps it (see ADR-006).

pub mod actions;
pub mod daily;
pub mod event;
pub mod finished;
pub mod hints;
pub mod messages;
pub mod observer;
pub mod reactions;
pub mod refusal;
pub mod seats;
pub mod table;
pub mod tutorial;

use beelot_game::RandomSource;

pub use actions::Action;
pub use daily::DailyResult;
pub use event::{Entry, Event, Origin};
pub use hints::{BidHint, CardView, Hint};
pub use observer::{NoObserver, Observer};
pub use refusal::Refusal;
pub use seats::{
    Connection, Lobby, Seat, SeatKind, Status, TableKind, local_seats, required_name, valid_target,
};
pub use table::{Actor, HintInput, Outcome, ReviewInput, SeedSource, Table, TableSetup, Work};

/// Deals from the operating system's generator: production deals need no reproducibility.
#[derive(Debug, Clone, Copy, Default)]
pub struct OsRandom;

impl RandomSource for OsRandom {
    fn next_int(&mut self, bound: i32) -> i32 {
        assert!(bound > 0, "the bound must be positive");
        let bound = bound as u32;
        // Rejects the top values that would make the remainder uneven.
        let zone = u32::MAX - u32::MAX % bound;
        loop {
            let mut bytes = [0u8; 4];
            getrandom::fill(&mut bytes).expect("the operating system's random generator");
            let value = u32::from_ne_bytes(bytes);
            if value < zone {
                return (value % bound) as i32;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn os_random_stays_within_its_bound_and_covers_it() {
        let mut rng = OsRandom;
        let mut seen = [false; 7];
        for _ in 0..1000 {
            let value = rng.next_int(7);
            assert!((0..7).contains(&value));
            seen[value as usize] = true;
        }
        assert!(seen.iter().all(|&hit| hit));
        assert_eq!(rng.next_int(1), 0);
    }
}
