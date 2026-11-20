//! What a spectator is shown of a table: the public parts only. The view is checked at every step of a round, in both
//! variants, against what seat 0 sees without its private parts, and against lists of the keys it may carry, so a
//! field added to the snapshot is a decision and never a leak.

use std::collections::BTreeSet;

use beelot_game::bot::strategies;
use beelot_game::{Card, Difficulty, Trump, Variant};
use beelot_server::api::{Viewer, snapshot};
use beelot_server::tables::{Action, Actor, Lobby, Table, TableSetup, local_seats};
use serde_json::{Value, json};
use time::OffsetDateTime;
use time::macros::datetime;
use uuid::Uuid;

const T0: OffsetDateTime = datetime!(2026-10-24 12:00 UTC);

fn solo(variant: Variant, seed: i64) -> Table {
    let setup =
        TableSetup::seeded(seed).with_strategy(strategies::for_difficulty(Difficulty::Relaxed));
    Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(local_seats(None).unwrap(), variant, true, true, 1_000),
        setup,
        T0,
    )
}

fn act(table: &mut Table, action: Action) {
    let description = format!("{action:?}");
    table
        .apply(Actor::Device, action, T0)
        .unwrap_or_else(|error| panic!("{description} was refused: {error:?}"));
}

fn card_action(card: Card) -> Action {
    Action::Card {
        rank: card.rank.label().into(),
        suit: card.suit,
        declare: None,
    }
}

fn view(table: &Table, viewer: Viewer) -> Value {
    serde_json::to_value(snapshot(table, viewer, T0)).unwrap()
}

/// What a spectator and seat 0 are shown at each step of a round: the auction, every card, the trick reviews and
/// the result.
fn round_of(variant: Variant, seed: i64) -> Vec<(Value, Value)> {
    let mut table = solo(variant, seed);
    let both = |table: &Table| (view(table, Viewer::Spectator), view(table, Viewer::Seat(0)));
    let mut steps = vec![both(&table)];
    for guard in 0.. {
        assert!(guard <= 80, "the round did not finish");
        if let Some(board) = table.board() {
            if board.round_result().is_some() {
                break;
            }
            let action = if board.reviewing_completed_trick() {
                Action::ContinueTrick
            } else {
                card_action(board.legal_cards(board.active_seat())[0])
            };
            act(&mut table, action);
        } else {
            let bidding = table.bidding().expect("an auction before the cards");
            let action = match variant {
                Variant::Contree if bidding.highest_bid() == 0 => Action::Contract {
                    value: 80,
                    suit: Some(Trump::Spades),
                },
                Variant::Contree => Action::Pass,
                Variant::Classic => Action::Trump {
                    suit: bidding.upturned_card().unwrap().suit,
                },
            };
            act(&mut table, action);
        }
        steps.push(both(&table));
    }
    steps
}

/// What the spectator is expected to see: what seat 0 sees, without anything private to it.
fn without_private_parts(mut view: Value) -> Value {
    view["you"] = Value::Null;
    for seat in view["table"]["seats"].as_array_mut().unwrap() {
        seat["you"] = json!(false);
    }
    if let Some(bidding) = view.get_mut("bidding") {
        bidding["hand"] = json!([]);
        bidding["dealt"] = json!([]);
        bidding["playerTurn"] = json!(false);
        bidding["coincheAllowed"] = json!(false);
    }
    if let Some(board) = view.get_mut("board") {
        for key in [
            "hand",
            "dealt",
            "legalCards",
            "illegalCards",
            "ownAnnouncements",
        ] {
            board[key] = json!([]);
        }
    }
    view
}

/// The cards in a seat's hand and the order they were dealt in are that seat's alone.
#[test]
fn a_spectator_is_given_no_seats_cards() {
    for (variant, seed) in ROUNDS {
        for (step, (spectator, seat)) in round_of(variant, seed).into_iter().enumerate() {
            let own_cards = |view: &Value| -> Vec<Value> {
                ["bidding", "board"]
                    .iter()
                    .flat_map(|part| {
                        ["hand", "dealt", "legalCards"].map(|key| view[*part][key].clone())
                    })
                    .collect()
            };
            assert!(
                own_cards(&seat)
                    .iter()
                    .any(|cards| cards.as_array().is_some_and(|c| !c.is_empty())),
                "seat 0 holds cards at {variant:?} seed {seed}, step {step}"
            );
            for cards in own_cards(&spectator) {
                assert!(
                    cards.is_null() || cards == json!([]),
                    "{variant:?} seed {seed}, step {step}: a spectator was given {cards}"
                );
            }
        }
    }
}

const ROUNDS: [(Variant, i64); 4] = [
    (Variant::Classic, 1),
    (Variant::Classic, 7),
    (Variant::Contree, 2),
    (Variant::Contree, 5),
];

#[test]
fn a_spectator_sees_what_a_seat_sees_without_its_private_parts() {
    for (variant, seed) in ROUNDS {
        let steps = round_of(variant, seed);
        let phases = |key: &str| {
            steps
                .iter()
                .filter(|(spectator, _)| spectator.get(key).is_some())
                .count()
        };
        assert!(
            phases("bidding") > 0 && phases("board") > 0,
            "{variant:?} {seed}"
        );
        for (step, (spectator, seat)) in steps.into_iter().enumerate() {
            assert_eq!(
                spectator,
                without_private_parts(seat),
                "{variant:?} seed {seed}, step {step}"
            );
        }
    }
}

fn keys(value: &Value) -> BTreeSet<&str> {
    value
        .as_object()
        .unwrap_or_else(|| panic!("not an object: {value}"))
        .keys()
        .map(String::as_str)
        .collect()
}

fn allowed(list: &[&'static str]) -> BTreeSet<&'static str> {
    list.iter().copied().collect()
}

/// Every key a spectator's snapshot may carry, part by part. A field added to a view fails the test below: decide
/// whether a spectator may see it (and that the view leaves it empty if not), then list it here.
#[test]
fn a_spectator_view_carries_only_the_keys_decided_for_it() {
    let snapshot = allowed(&[
        "version",
        "moves",
        "tableId",
        "kind",
        "you",
        "table",
        "bidding",
        "board",
        "match",
        "reactions",
    ]);
    let table = allowed(&[
        "id",
        "invitationCode",
        "ownerPosition",
        "status",
        "variant",
        "variantLabel",
        "turnTimerSeconds",
        "seats",
        "publicTable",
        "botFillAt",
        "announcements",
        "allTrumps",
        "target",
        "kind",
        "difficulty",
        "difficultyLabel",
        "passAndPlay",
        "hints",
        "undoOffered",
        "undosLeft",
        "spectatorsAllowed",
        "spectators",
    ]);
    let seat = allowed(&[
        "name",
        "ready",
        "connectionState",
        "position",
        "you",
        "type",
    ]);
    let bidding = allowed(&[
        "hand",
        "dealt",
        "upturnedCard",
        "round",
        "activePlayer",
        "playerTurn",
        "message",
        "variant",
        "highestBid",
        "highestBidSuit",
        "highestBidder",
        "coincheAllowed",
        "complete",
        "dealerIndex",
        "calls",
        "currentPlayerIndex",
        "auctionId",
        "auction",
    ]);
    let board = allowed(&[
        "hand",
        "dealt",
        "legalCards",
        "illegalCards",
        "seats",
        "trump",
        "declaringTeam",
        "activePlayer",
        "completedTricks",
        "northSouthScore",
        "eastWestScore",
        "currentTrick",
        "reviewingCompletedTrick",
        "trickWinner",
        "trickPoints",
        "declarationMessage",
        "beloteBonusPoints",
        "roundResult",
        "variant",
        "contractValue",
        "coinched",
        "currentPlayer",
        "currentPlayerIndex",
        "activePlayerIndex",
        "dealerIndex",
        "declaringPlayerIndex",
        "announcements",
        "ownAnnouncements",
        "declarers",
        "revealedAnnouncements",
    ]);
    let round_match = allowed(&[
        "northSouth",
        "eastWest",
        "complete",
        "winner",
        "target",
        "recap",
        "rematchVoted",
        "rematchPending",
    ]);
    for (variant, seed) in ROUNDS {
        for (spectator, _) in round_of(variant, seed) {
            let check = |part: &Value, list: &BTreeSet<&str>, name: &str| {
                let unknown: Vec<_> = keys(part).difference(list).copied().collect();
                assert!(
                    unknown.is_empty(),
                    "{name} carries keys nobody decided on: {unknown:?}"
                );
            };
            check(&spectator, &snapshot, "the snapshot");
            check(&spectator["table"], &table, "the table");
            for seat_view in spectator["table"]["seats"].as_array().unwrap() {
                check(seat_view, &seat, "a seat");
            }
            if spectator.get("bidding").is_some() {
                check(&spectator["bidding"], &bidding, "the bidding");
            }
            if spectator.get("board").is_some() {
                check(&spectator["board"], &board, "the board");
            }
            if spectator.get("match").is_some() {
                check(&spectator["match"], &round_match, "the match");
            }
        }
    }
}
