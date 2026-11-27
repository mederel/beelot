//! A Klaverjas table (US-213): a whole solo match, and no hint or analysis, whose search knows neither the Amsterdam
//! trumping rule nor roem; and the Rotterdam rules (US-214) that the table's deals are played by.

use beelot_game::bot::strategies;
use beelot_game::rules::Trumping;
use beelot_game::{Card, Difficulty, KlaverjasRules, Variant};
use beelot_server::tables::{Action, Actor, Lobby, Table, TableSetup, local_seats};
use time::OffsetDateTime;
use time::macros::datetime;
use uuid::Uuid;

const T0: OffsetDateTime = datetime!(2026-11-27 12:00 UTC);

fn solo(seed: i64) -> Table {
    solo_with(seed, KlaverjasRules::Amsterdams)
}

fn solo_with(seed: i64, rules: KlaverjasRules) -> Table {
    Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(
            local_seats(None).unwrap(),
            Variant::Klaverjas,
            false,
            false,
            1_500,
        )
        .with_klaverjas_rules(rules),
        TableSetup::seeded(seed).with_strategy(strategies::for_difficulty(Difficulty::Relaxed)),
        T0,
    )
}

fn card_action(card: Card) -> Action {
    Action::Card {
        rank: card.rank.label().into(),
        suit: card.suit,
        declare: None,
    }
}

/// Plays the human's turns until `done` says the table has reached the point: the human names the first suit of their
/// hand, so they always play when it is their turn to choose.
fn play_until(table: &mut Table, done: impl Fn(&Table) -> bool) {
    for _ in 0..5_000 {
        if done(table) {
            return;
        }
        let action = if let Some(board) = table.board() {
            if board.round_result().is_some() {
                Action::NextRound
            } else if board.reviewing_completed_trick() {
                Action::ContinueTrick
            } else {
                card_action(board.legal_cards(board.active_seat())[0])
            }
        } else {
            let bidding = table.bidding().expect("an auction");
            let suit = bidding.hand(bidding.active_seat())[0].suit;
            Action::Trump { suit }
        };
        table
            .apply(Actor::Device, action.clone(), T0)
            .unwrap_or_else(|error| panic!("{action:?} was refused: {error:?}"));
    }
    panic!("the table never reached the point");
}

#[test]
fn a_solo_klaverjas_match_is_played_to_1500() {
    let mut table = solo(5);
    assert_eq!(table.match_score().unwrap().target(), 1_500);
    play_until(&mut table, |table| {
        table.match_score().is_some_and(|score| score.complete())
    });
    let score = table.match_score().unwrap();
    assert!(score.north_south().max(score.east_west()) >= 1_500);
}

#[test]
fn a_klaverjas_table_gives_no_hint_and_no_analysis() {
    let mut table = solo(9);
    assert!(
        table.hint_input(Actor::Device).is_err(),
        "no hint in the auction"
    );
    play_until(&mut table, |table| {
        table
            .board()
            .is_some_and(|board| board.round_result().is_some())
    });
    assert!(
        table.review_input(Actor::Device).is_err(),
        "no analysis of the round"
    );
}

#[test]
fn every_deal_of_a_rotterdams_table_is_played_by_the_rotterdam_rules() {
    let mut table = solo_with(3, KlaverjasRules::Rotterdams);
    assert_eq!(
        table.bidding().unwrap().klaverjas_rules(),
        KlaverjasRules::Rotterdams
    );
    // Two deals: the rule set also reaches the deals after the first.
    for _ in 0..2 {
        play_until(&mut table, |table| table.board().is_some());
        assert_eq!(table.board().unwrap().trumping(), Trumping::Rotterdams);
        play_until(&mut table, |table| table.bidding().is_some());
    }
    let amsterdams = solo(3);
    assert_eq!(
        amsterdams.bidding().unwrap().klaverjas_rules(),
        KlaverjasRules::Amsterdams
    );
}
