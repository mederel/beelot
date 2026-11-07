//! Tests of the review of a round's costly cards (US-067).

use std::time::Duration;

use beelot_game::board::SeatCard;
use beelot_game::bot::review::{COSTLY_POINTS, costly_cards};
use beelot_game::bot::solver::{DoubleDummySolver, Position};
use beelot_game::card::{Card, Seat, Trump};
use beelot_game::rng::{RandomSource, SplitMix64, shuffle};
use beelot_game::rules;

const BUDGET: Duration = Duration::from_secs(120);

fn trick_cards(trick: &[SeatCard]) -> Vec<Card> {
    trick.iter().map(|played| played.card).collect()
}

/// Plays a whole round from a shuffled deal, each card chosen by `choose` among the legal ones.
fn play_round(
    seed: i64,
    trump: Trump,
    choose: &mut dyn FnMut(&Position, &[Card]) -> Card,
) -> Vec<Vec<SeatCard>> {
    let mut deck = Card::deck();
    shuffle(&mut deck, &mut SplitMix64::new(seed));
    let mut hands: [Vec<Card>; 4] =
        std::array::from_fn(|seat| deck[seat * 8..seat * 8 + 8].to_vec());
    let first_leader: Seat = 1;
    let mut leader = first_leader;
    let mut tricks: Vec<Vec<SeatCard>> = Vec::new();
    for _ in 0..8 {
        let mut current: Vec<SeatCard> = Vec::new();
        for offset in 0..4 {
            let seat = (leader + offset) % 4;
            let legal = rules::legal_cards(&hands[seat], &trick_cards(&current), trump);
            let position = Position {
                hands: hands.clone(),
                trump,
                tricks: tricks.clone(),
                current_trick: current.clone(),
                first_leader,
            };
            let card = choose(&position, &legal);
            hands[seat].retain(|&held| held != card);
            current.push(SeatCard { seat, card });
        }
        leader = current[rules::winning_index(&trick_cards(&current), trump)].seat;
        tricks.push(current);
    }
    tricks
}

#[test]
fn a_round_played_with_the_best_card_every_time_has_no_costly_card() {
    let mut solver = DoubleDummySolver::new();
    let tricks = play_round(5, Trump::Hearts, &mut |position, _| {
        solver.solve(position).best_card.unwrap()
    });
    for seat in 0..4 {
        let analysis = costly_cards(&tricks, Trump::Hearts, seat, BUDGET);
        assert!(analysis.complete);
        assert!(
            analysis.costly.is_empty(),
            "seat {seat}: {:?}",
            analysis.costly
        );
    }
}

#[test]
fn costly_cards_are_ten_points_or_more_and_never_the_best_card() {
    for seed in 1..4 {
        let mut random = SplitMix64::new(100 + seed);
        let tricks = play_round(seed, Trump::Spades, &mut |_, legal| {
            legal[random.next_int(legal.len() as i32) as usize]
        });
        for seat in 0..4 {
            let analysis = costly_cards(&tricks, Trump::Spades, seat, BUDGET);
            assert!(analysis.complete);
            let order: Vec<(usize, usize)> = analysis
                .costly
                .iter()
                .map(|c| (c.trick, c.position))
                .collect();
            assert!(order.windows(2).all(|pair| pair[0] < pair[1]));
            for costly in &analysis.costly {
                assert!(costly.points_lost >= COSTLY_POINTS);
                assert_ne!(costly.played, costly.best);
                assert_eq!(tricks[costly.trick][costly.position].card, costly.played);
                assert_eq!(tricks[costly.trick][costly.position].seat, seat);
            }
        }
    }
}

#[test]
fn an_exhausted_budget_reports_an_incomplete_analysis() {
    let mut random = SplitMix64::new(9);
    let tricks = play_round(2, Trump::Clubs, &mut |_, legal| {
        legal[random.next_int(legal.len() as i32) as usize]
    });
    let analysis = costly_cards(&tricks, Trump::Clubs, 0, Duration::ZERO);
    assert!(!analysis.complete);
}
