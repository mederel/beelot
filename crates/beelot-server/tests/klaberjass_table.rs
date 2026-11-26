//! A two-seat table (US-219): seats, lobby, bots' turns, undo and rematch with Klaberjass.

use beelot_game::bot::strategies;
use beelot_game::{Card, Difficulty, Variant};
use beelot_server::tables::{
    Action, Actor, Lobby, Status, Table, TableKind, TableSetup, local_seats,
};
use time::OffsetDateTime;
use time::macros::datetime;
use uuid::Uuid;

const T0: OffsetDateTime = datetime!(2026-11-26 12:00 UTC);

fn setup(seed: i64) -> TableSetup {
    TableSetup::seeded(seed).with_strategy(strategies::for_difficulty(Difficulty::Relaxed))
}

fn solo(seed: i64) -> Table {
    Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(
            local_seats(None).unwrap(),
            Variant::Klaberjass,
            false,
            false,
            500,
        ),
        setup(seed),
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

/// Plays the human's turns until `done` says the table has reached the point.
fn play_until(table: &mut Table, actor: Actor, done: impl Fn(&Table) -> bool) {
    for _ in 0..3_000 {
        if done(table) {
            return;
        }
        let action = if let Some(board) = table.board() {
            if board.round_result().is_some() {
                Action::NextRound
            } else if board.reviewing_completed_trick() {
                Action::ContinueTrick
            } else {
                let seat = board.active_seat();
                card_action(board.legal_cards(seat)[0])
            }
        } else {
            let bidding = table.bidding().expect("an auction");
            match bidding.upturned_card() {
                Some(card) if bidding.round() == 1 => Action::Trump { suit: card.suit },
                _ => Action::Pass,
            }
        };
        table
            .apply(actor, action.clone(), T0)
            .unwrap_or_else(|error| panic!("{action:?} was refused: {error:?}"));
    }
    panic!("the table never reached the point");
}

#[test]
fn a_solo_table_has_two_seats_and_the_bot_answers() {
    let table = solo(7);
    let lobby = table.lobby();
    assert_eq!(lobby.seat_count(), 2);
    assert_eq!(lobby.occupied().count(), 2);
    assert!(lobby.seat(2).is_none() && lobby.seat(3).is_none());
    assert_eq!(table.match_score().unwrap().target(), 500);
}

#[test]
fn a_solo_match_is_played_to_its_end_and_a_rematch_starts_another() {
    let mut table = solo(11);
    play_until(&mut table, Actor::Device, |table| {
        table.match_score().is_some_and(|score| score.complete())
    });
    let score = table.match_score().unwrap();
    assert!(score.north_south().max(score.east_west()) >= 500);
    table.apply(Actor::Device, Action::Rematch, T0).unwrap();
    assert!(!table.match_score().unwrap().complete());
    assert_eq!(table.match_score().unwrap().north_south(), 0);
}

#[test]
fn the_last_card_of_the_solo_player_can_be_taken_back() {
    let mut table = solo(13);
    let mut played = false;
    for _ in 0..200 {
        let Some(board) = table.board() else {
            let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
            let action = if table.bidding().unwrap().round() == 1 {
                Action::Trump { suit }
            } else {
                Action::Pass
            };
            table.apply(Actor::Device, action, T0).unwrap();
            continue;
        };
        if board.reviewing_completed_trick() {
            table
                .apply(Actor::Device, Action::ContinueTrick, T0)
                .unwrap();
            continue;
        }
        let card = board.legal_cards(board.active_seat())[0];
        table.apply(Actor::Device, card_action(card), T0).unwrap();
        if table.undo_offered() {
            played = true;
            break;
        }
    }
    assert!(played, "a card of the human can be offered back");
    table.apply(Actor::Device, Action::Undo, T0).unwrap();
    assert_eq!(table.undos_left(), 2);
}

#[test]
fn a_private_table_starts_with_two_players_or_one_and_a_bot() {
    let lobby = Lobby::private("Ana".into(), None, Variant::Klaberjass);
    let mut table = Table::online(
        Uuid::new_v4(),
        TableKind::Private,
        Some("ABC234".into()),
        lobby,
        setup(3),
        T0,
    );
    let ben = table.join("Ben".into(), None, T0).unwrap();
    assert_eq!(ben, 1);
    assert!(
        table.join("Cleo".into(), None, T0).is_err(),
        "the table is full"
    );
    table
        .apply(Actor::Seat(0), Action::Ready { ready: true }, T0)
        .unwrap();
    assert!(
        table
            .apply(
                Actor::Seat(0),
                Action::Start {
                    fill_with_bots: false
                },
                T0
            )
            .is_err(),
        "Ben is not ready"
    );
    table
        .apply(Actor::Seat(1), Action::Ready { ready: true }, T0)
        .unwrap();
    table
        .apply(
            Actor::Seat(0),
            Action::Start {
                fill_with_bots: false,
            },
            T0,
        )
        .unwrap();
    assert_eq!(table.lobby().status(), Status::InProgress);
    assert!(table.bidding().is_some());
}

#[test]
fn a_lone_player_at_a_private_table_gets_one_bot() {
    let lobby = Lobby::private("Ana".into(), None, Variant::Klaberjass);
    let mut table = Table::online(
        Uuid::new_v4(),
        TableKind::Private,
        Some("ABC234".into()),
        lobby,
        setup(5),
        T0,
    );
    table
        .apply(Actor::Seat(0), Action::Ready { ready: true }, T0)
        .unwrap();
    table
        .apply(
            Actor::Seat(0),
            Action::Start {
                fill_with_bots: true,
            },
            T0,
        )
        .unwrap();
    assert_eq!(table.lobby().occupied().count(), 2);
    assert!(table.lobby().seat(1).unwrap().played_by_bot());
    play_until(&mut table, Actor::Seat(0), |table| {
        table.match_score().is_some_and(|score| score.complete())
    });
}
