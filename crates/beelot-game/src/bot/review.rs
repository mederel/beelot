//! Finds the cards of a finished round that cost a team points (US-067). For each card a seat played, the
//! double-dummy solver compares what the team could still score with the best card against what it could score after
//! the card actually played. The cards are read from the round's tricks alone: every hand is the cards its seat played.

use std::time::{Duration, Instant};

use crate::board::SeatCard;
use crate::bot::solver::{DoubleDummySolver, Position, Solution};
use crate::card::{Card, Seat, Trump};

/// A card is costly when the team could have scored at least this many more points with the best card.
pub const COSTLY_POINTS: i32 = 10;

/// A costly card: where it was played (the trick and its place in it), the better card for the same situation and the
/// points the team lost by not playing it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CostlyCard {
    pub trick: usize,
    pub position: usize,
    pub played: Card,
    pub best: Card,
    pub points_lost: i32,
}

/// The costly cards in the order played, and whether every card was examined within the time budget.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Analysis {
    pub costly: Vec<CostlyCard>,
    pub complete: bool,
}

fn team_points(solution: &Solution, seat: Seat) -> i32 {
    if seat % 2 == 0 {
        solution.north_south_points
    } else {
        solution.east_west_points
    }
}

/// The round after `played` cards of trick number `trick` were played.
fn position_after(
    tricks: &[Vec<SeatCard>],
    trick: usize,
    played: usize,
    trump: Trump,
    first_leader: Seat,
) -> Position {
    let (completed, current) = if played == tricks[trick].len() {
        (&tricks[..=trick], Vec::new())
    } else {
        (&tricks[..trick], tricks[trick][..played].to_vec())
    };
    let mut hands: [Vec<Card>; 4] = std::array::from_fn(|_| Vec::new());
    for (offset, cards) in tricks[completed.len()..].iter().enumerate() {
        let skip = if offset == 0 { current.len() } else { 0 };
        for played_card in cards.iter().skip(skip) {
            hands[played_card.seat].push(played_card.card);
        }
    }
    Position {
        hands,
        trump,
        tricks: completed.to_vec(),
        current_trick: current,
        first_leader,
    }
}

/// The costly cards of the seat in a round. The newest cards are examined first, being the quickest to solve, and the
/// search stops once `budget` is spent, which `complete` reports.
pub fn costly_cards(
    tricks: &[Vec<SeatCard>],
    trump: Trump,
    seat: Seat,
    budget: Duration,
) -> Analysis {
    let started = Instant::now();
    let Some(first_leader) = tricks
        .first()
        .and_then(|trick| trick.first())
        .map(|c| c.seat)
    else {
        return Analysis {
            costly: Vec::new(),
            complete: true,
        };
    };
    let mut solver = DoubleDummySolver::new();
    let mut costly = Vec::new();
    let mut complete = true;
    'search: for trick in (0..tricks.len()).rev() {
        for position in (0..tricks[trick].len()).rev() {
            let played = tricks[trick][position];
            if played.seat != seat {
                continue;
            }
            if started.elapsed() > budget {
                complete = false;
                break 'search;
            }
            let before = position_after(tricks, trick, position, trump, first_leader);
            let after = position_after(tricks, trick, position + 1, trump, first_leader);
            let best = solver.solve(&before);
            let lost = team_points(&best, seat) - team_points(&solver.solve(&after), seat);
            if let (true, Some(best_card)) = (lost >= COSTLY_POINTS, best.best_card) {
                costly.push(CostlyCard {
                    trick,
                    position,
                    played: played.card,
                    best: best_card,
                    points_lost: lost,
                });
            }
        }
    }
    costly.sort_by_key(|card| (card.trick, card.position));
    Analysis { costly, complete }
}
