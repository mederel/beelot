//! A Bazar Blot table (US-216): a whole solo match to 301 in tens, contra and recontra as table actions, the targets of
//! the variant, and no hint or analysis.

use beelot_game::bot::strategies;
use beelot_game::{Card, Difficulty, Trump, Variant};
use beelot_server::tables::{Action, Actor, Lobby, Table, TableSetup, local_seats};
use time::OffsetDateTime;
use time::macros::datetime;
use uuid::Uuid;

const T0: OffsetDateTime = datetime!(2026-11-27 12:00 UTC);

fn solo(seed: i64, target: i32) -> Table {
    Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(
            local_seats(None).unwrap(),
            Variant::BazarBlot,
            true,
            false,
            target,
        ),
        TableSetup::seeded(seed).with_strategy(strategies::for_difficulty(Difficulty::Relaxed)),
        T0,
    )
}

fn card_action(card: Card) -> Action {
    Action::Card {
        rank: card.rank.label().into(),
        suit: card.suit,
        declare: Some(true),
    }
}

/// Plays the human's turns until `done` says the table has reached the point: the human opens at 8 in the suit of their
/// first card when nobody has bid, and passes otherwise.
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
            if bidding.highest_bid() == 0 {
                let suit = bidding.hand(bidding.active_seat())[0].suit;
                Action::Contract {
                    value: 8,
                    suit: Some(Trump::from(suit)),
                }
            } else {
                Action::Pass
            }
        };
        table
            .apply(Actor::Device, action.clone(), T0)
            .unwrap_or_else(|error| panic!("{action:?} was refused: {error:?}"));
    }
    panic!("the table never reached the point");
}

#[test]
fn a_solo_bazar_blot_match_is_played_to_301_in_tens() {
    let mut table = solo(5, 301);
    assert_eq!(table.match_score().unwrap().target(), 301);
    play_until(&mut table, |table| {
        table.match_score().is_some_and(|score| score.complete())
    });
    let score = table.match_score().unwrap();
    let rounds = score.rounds().len();
    assert!(score.north_south().max(score.east_west()) >= 301);
    assert!(rounds >= 7, "301 in tens takes several deals, not {rounds}");
}

#[test]
fn the_human_says_contra_and_the_bots_answer() {
    for seed in 0..40 {
        let mut table = solo(seed, 101);
        // The human, North, speaks first: they pass, and say contra on the first opponent's bid they are asked about.
        let mut said = false;
        for _ in 0..12 {
            let Some(bidding) = table.bidding().filter(|_| table.board().is_none()) else {
                break;
            };
            let action = if bidding.can_coinche(0) {
                said = true;
                Action::Coinche
            } else if bidding.can_recontra(0) {
                Action::Recontra
            } else {
                Action::Pass
            };
            table.apply(Actor::Device, action, T0).unwrap();
            if said {
                break;
            }
        }
        if said {
            let board = table.board().expect("the bots answered the contra");
            assert!(board.coinched());
            return;
        }
    }
    panic!("no bot bid against the human in forty deals");
}

#[test]
fn a_bazar_blot_table_offers_its_own_targets() {
    let mut lobby = Lobby::private("Ana".into(), None, Variant::BazarBlot);
    assert_eq!(lobby.target(), 301);
    lobby.set_target(0, 151).unwrap();
    assert_eq!(lobby.target(), 151);
    assert!(lobby.set_target(0, 1_000).is_err());
    let mut classic = Lobby::private("Ana".into(), None, Variant::Classic);
    assert!(classic.set_target(0, 301).is_err());
}

#[test]
fn a_bazar_blot_table_gives_no_hint_and_no_analysis() {
    let mut table = solo(9, 301);
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
