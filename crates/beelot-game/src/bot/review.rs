//! Finds the cards of a finished round that cost a team points (US-067). For each card a seat played, the
//! double-dummy solver compares what the team could still score with the best card against what it could score after
//! the card actually played. The cards are read from the round's tricks alone: every hand is the cards its seat played.

use std::time::{Duration, Instant};

use crate::board::{PlayView, SeatCard};
use crate::bot::hints::{CardReason, card_reason};
use crate::bot::solver::{DoubleDummySolver, Position, Solution};
use crate::card::{Card, Seat, Trump, Variant};
use crate::rules;

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
    if seat.is_multiple_of(2) {
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

/// Why a seat played a card (US-149): the hint engine's reason for the card, from what that seat knew at the time.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlayReason {
    pub trick: usize,
    pub position: usize,
    pub seat: Seat,
    pub reason: CardReason,
}

/// The reasons for the cards the given seats played in a finished round, in play order. Each reason is derived from
/// that seat's own view only: its own cards (the ones it still had to play), the tricks already played and the cards
/// already on the table, never another seat's hand. A card whose only reason is the general "best for the round" has no
/// known reason and is left out rather than guessed.
pub fn play_reasons(
    tricks: &[Vec<SeatCard>],
    trump: Trump,
    variant: Variant,
    declaring_seat: Seat,
    seats: &[Seat],
) -> Vec<PlayReason> {
    let mut found = Vec::new();
    for (trick, cards) in tricks.iter().enumerate() {
        for (position, played) in cards.iter().enumerate() {
            if !seats.contains(&played.seat) {
                continue;
            }
            let hand: Vec<Card> = tricks[trick..]
                .iter()
                .flatten()
                .filter(|card| card.seat == played.seat)
                .map(|card| card.card)
                .collect();
            let on_table = &cards[..position];
            let table_cards: Vec<Card> = on_table.iter().map(|card| card.card).collect();
            let view = PlayView {
                seat: played.seat,
                legal_cards: rules::legal_cards(&hand, &table_cards, trump),
                hand,
                trump,
                variant,
                // Neither reads the contract's value nor a coinche, and the reasons need no more than the cards.
                contract_value: 0,
                coinched: false,
                declaring_seat,
                tricks: tricks[..trick].to_vec(),
                current_trick: on_table.to_vec(),
                announcements: false,
                revealed_announcements: Vec::new(),
            };
            let reason = card_reason(&view, played.card);
            if reason != CardReason::BestForRound {
                found.push(PlayReason {
                    trick,
                    position,
                    seat: played.seat,
                    reason,
                });
            }
        }
    }
    found
}

#[cfg(test)]
mod play_reason_tests {
    use super::*;

    fn card(code: &str) -> Card {
        code.parse().unwrap()
    }

    fn seat_card(seat: Seat, code: &str) -> SeatCard {
        SeatCard {
            seat,
            card: card(code),
        }
    }

    /// Two tricks; `east` and `west` are the second cards of those seats, which North cannot know at trick one.
    fn round(east: &str, west: &str) -> Vec<Vec<SeatCard>> {
        vec![
            vec![
                seat_card(0, "AS"),
                seat_card(1, "7S"),
                seat_card(2, "KS"),
                seat_card(3, "8S"),
            ],
            vec![
                seat_card(0, "7D"),
                seat_card(1, east),
                seat_card(2, "9D"),
                seat_card(3, west),
            ],
        ]
    }

    #[test]
    fn a_reason_never_depends_on_a_hand_the_seat_could_not_see() {
        let one = round("8D", "10D");
        let other = round("8C", "10C");
        let trump = Trump::Hearts;
        let reasons = |tricks: &[Vec<SeatCard>]| {
            play_reasons(tricks, trump, Variant::Classic, 0, &[0])
        };
        assert_eq!(reasons(&one), reasons(&other));
    }

    #[test]
    fn only_the_asked_seats_have_reasons_and_each_comes_with_its_place() {
        let tricks = round("8D", "10D");
        let trump = Trump::Hearts;
        let found = play_reasons(&tricks, trump, Variant::Classic, 0, &[1, 3]);
        assert!(found.iter().all(|reason| reason.seat == 1 || reason.seat == 3));
        assert!(found.iter().all(|reason| reason.reason != CardReason::BestForRound));
        assert!(found.windows(2).all(|pair| (pair[0].trick, pair[0].position) < (pair[1].trick, pair[1].position)));
    }

    #[test]
    fn a_master_card_led_is_explained() {
        let tricks = round("8D", "10D");
        let trump = Trump::Hearts;
        let found = play_reasons(&tricks, trump, Variant::Classic, 0, &[0]);
        assert_eq!(found.first().map(|reason| reason.reason), Some(CardReason::CashMaster));
    }
}
