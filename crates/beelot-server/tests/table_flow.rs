//! The game flow at a table: solo, pass-and-play and private tables.

use std::time::Duration;

use beelot_game::bidding::CallType;
use beelot_game::bot::BotStrategy;
use beelot_game::bot::strategies;
use beelot_game::scoring::RoundResult;
use beelot_game::{Card, Difficulty, Suit, Team, Trump, Variant};
use beelot_server::error::AppError;
use beelot_server::tables::finished::{DELETED_PLAYER, FinishedSeat, Mode};
use beelot_server::tables::{
    Action, Actor, Connection, Lobby, Outcome, SeatKind, Status, Table, TableKind, TableSetup,
    local_seats,
};
use time::OffsetDateTime;
use time::macros::{date, datetime};
use uuid::Uuid;

const T0: OffsetDateTime = datetime!(2026-10-24 12:00 UTC);

fn relaxed() -> &'static dyn BotStrategy {
    strategies::for_difficulty(Difficulty::Relaxed)
}

/// Deals from seeded generators, and plays the Relaxed bots, which are quick, unless a test needs another.
fn setup(seed: i64) -> TableSetup {
    TableSetup::seeded(seed).with_strategy(relaxed())
}

fn solo(variant: Variant, seed: i64) -> Table {
    solo_with(variant, Difficulty::Relaxed, true, None, setup(seed))
}

fn solo_with(
    variant: Variant,
    difficulty: Difficulty,
    announcements: bool,
    account: Option<Uuid>,
    setup: TableSetup,
) -> Table {
    let mut seats = local_seats(None).unwrap();
    seats[0].account = account;
    Table::local(
        Uuid::new_v4(),
        difficulty,
        Lobby::local(seats, variant, announcements, true, 1_000),
        setup,
        T0,
    )
}

fn pass_and_play(variant: Variant, names: [Option<&str>; 4], setup: TableSetup) -> Table {
    let names: Vec<Option<String>> = names.iter().map(|name| name.map(str::to_owned)).collect();
    let seats = local_seats(Some(&names)).unwrap();
    Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(seats, variant, true, true, 1_000),
        setup,
        T0,
    )
}

/// A private table with Ana as its owner, still waiting for players.
fn private(variant: Variant, account: Option<Uuid>, setup: TableSetup) -> Table {
    let lobby = Lobby::private("Ana".into(), account, variant);
    Table::online(
        Uuid::new_v4(),
        TableKind::Private,
        Some("ABC234".into()),
        lobby,
        setup,
        T0,
    )
}

/// A private table whose owner started at once with three bots.
fn private_with_bots(variant: Variant, setup: TableSetup) -> Table {
    let mut table = private(variant, None, setup);
    act(&mut table, Actor::Seat(0), Action::Ready { ready: true });
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );
    table
}

fn act(table: &mut Table, actor: Actor, action: Action) -> Outcome {
    let description = format!("{action:?}");
    table
        .apply(actor, action, T0)
        .unwrap_or_else(|error| panic!("{description} was refused: {error:?}"))
}

fn refusal(result: Result<Outcome, AppError>) -> String {
    match result.expect_err("a refusal") {
        AppError::Conflict { message, .. } => message,
        other => panic!("not a conflict: {other:?}"),
    }
}

fn card_action(card: Card) -> Action {
    Action::Card {
        rank: card.rank.label().into(),
        suit: card.suit,
        declare: None,
    }
}

/// The seat the actor plays for now.
fn acting_seat(table: &Table, actor: Actor) -> usize {
    match actor {
        Actor::Seat(position) => position,
        Actor::Device => table.board().map_or_else(
            || table.bidding().unwrap().active_seat(),
            |board| board.active_seat(),
        ),
        Actor::Spectator => panic!("a spectator takes no seat"),
    }
}

fn auction_complete(table: &Table) -> bool {
    table.board().is_some()
}

/// Bids 160 Spades, coinches when allowed, or passes, until the auction ends.
fn finish_auction_at_160(table: &mut Table, actor: Actor) {
    for guard in 0.. {
        assert!(guard <= 20, "the auction did not complete");
        if auction_complete(table) {
            return;
        }
        let bidding = table.bidding().unwrap();
        let seat = acting_seat(table, actor);
        let action = if bidding.highest_bid() < 160 {
            Action::Contract {
                value: 160,
                suit: Some(Trump::Spades),
            }
        } else if bidding.can_coinche(seat) {
            Action::Coinche
        } else {
            Action::Pass
        };
        act(table, actor, action);
    }
}

/// Opens at 80 when nobody has bid, else passes, until the auction ends.
fn finish_auction_at_80(table: &mut Table, actor: Actor) {
    for guard in 0.. {
        assert!(guard <= 40, "the auction did not complete");
        if auction_complete(table) {
            return;
        }
        let action = if table.bidding().unwrap().highest_bid() == 0 {
            Action::Contract {
                value: 80,
                suit: Some(Trump::Spades),
            }
        } else {
            Action::Pass
        };
        act(table, actor, action);
    }
}

/// Takes the upturned suit in Classic, or finishes a Contrée auction at 160.
fn finish_auction(table: &mut Table, actor: Actor) {
    if table.lobby().variant() == Variant::Contree {
        return finish_auction_at_160(table, actor);
    }
    for guard in 0.. {
        assert!(guard <= 20, "the auction did not complete");
        if auction_complete(table) {
            return;
        }
        let bidding = table.bidding().unwrap();
        let upturned = bidding.upturned_card().unwrap().suit;
        let suit = if bidding.round() == 1 {
            upturned
        } else if upturned == Suit::Clubs {
            Suit::Spades
        } else {
            Suit::Clubs
        };
        act(table, actor, Action::Trump { suit });
    }
}

/// Plays the actor's first legal card, or collects a completed trick, until the round ends.
fn play_round(table: &mut Table, actor: Actor) -> RoundResult {
    for guard in 0.. {
        assert!(guard <= 40, "the round did not finish");
        let board = table.board().expect("the auction is over");
        if let Some(result) = board.round_result() {
            return result.clone();
        }
        if board.reviewing_completed_trick() {
            act(table, actor, Action::ContinueTrick);
        } else {
            let seat = acting_seat(table, actor);
            assert_eq!(board.active_seat(), seat, "control is back with the human");
            let card = board.legal_cards(seat)[0];
            act(table, actor, card_action(card));
        }
    }
    unreachable!()
}

/// Plays rounds until a team wins; returns what each round awarded and how many rounds were played.
fn play_match(table: &mut Table, actor: Actor) -> Vec<Outcome> {
    let mut outcomes = Vec::new();
    for round in 1.. {
        assert!(round <= 20, "the match did not end after 20 rounds");
        if round > 1 {
            outcomes.push(act(table, actor, Action::NextRound));
        }
        finish_auction(table, actor);
        loop {
            let board = table.board().unwrap();
            if board.round_result().is_some() {
                break;
            }
            let action = if board.reviewing_completed_trick() {
                Action::ContinueTrick
            } else {
                card_action(board.legal_cards(acting_seat(table, actor))[0])
            };
            outcomes.push(act(table, actor, action));
        }
        if table.match_score().unwrap().complete() {
            return outcomes;
        }
    }
    unreachable!()
}

fn finished_count(outcomes: &[Outcome]) -> usize {
    outcomes
        .iter()
        .filter(|outcome| outcome.finished.is_some())
        .count()
}

// BotGameServiceTest

#[test]
fn player_receives_five_cards_before_bidding_and_eight_after_choosing_trump() {
    let mut table = solo(Variant::Classic, 1);
    assert_eq!(table.bidding().unwrap().hand(0).len(), 5);
    let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
    act(&mut table, Actor::Device, Action::Trump { suit });
    let board = table.board().unwrap();
    assert_eq!(board.hand(0).len(), 8);
    assert_eq!((0..4).map(|seat| board.hand(seat).len()).sum::<usize>(), 32);
}

#[test]
fn active_player_can_play_only_from_the_legal_set() {
    let mut table = solo(Variant::Classic, 2);
    let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
    act(&mut table, Actor::Device, Action::Trump { suit });
    let board = table.board().unwrap();
    assert_eq!(board.legal_cards(0).len(), 8);
    let illegal = Card::deck()
        .into_iter()
        .find(|card| !board.hand(0).contains(card))
        .unwrap();
    assert_eq!(
        refusal(table.apply(Actor::Device, card_action(illegal), T0)),
        "That card is not a legal play."
    );

    let card = table.board().unwrap().legal_cards(0)[0];
    act(&mut table, Actor::Device, card_action(card));
    let board = table.board().unwrap();
    assert_eq!(board.hand(0).len(), 7);
    assert_eq!(board.visible_trick().len(), 4);
    assert_eq!(board.completed_tricks(), 1);
    assert!(board.reviewing_completed_trick());
    assert!(board.legal_cards(0).is_empty());
}

#[test]
fn an_unknown_rank_is_not_a_legal_play() {
    let mut table = solo(Variant::Classic, 2);
    let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
    act(&mut table, Actor::Device, Action::Trump { suit });
    let action = Action::Card {
        rank: "11".into(),
        suit: Suit::Hearts,
        declare: None,
    };
    assert_eq!(
        refusal(table.apply(Actor::Device, action, T0)),
        "That card is not a legal play."
    );
}

#[test]
fn last_trick_is_played_for_the_human_and_the_round_is_recorded() {
    let challenging =
        TableSetup::seeded(3).with_strategy(strategies::for_difficulty(Difficulty::Challenging));
    let mut table = solo_with(
        Variant::Contree,
        Difficulty::Challenging,
        true,
        None,
        challenging,
    );
    act(
        &mut table,
        Actor::Device,
        Action::Contract {
            value: 160,
            suit: Some(Trump::Spades),
        },
    );
    finish_auction_at_160(&mut table, Actor::Device);
    loop {
        let board = table.board().unwrap();
        if board.round_result().is_some() {
            break;
        }
        if board.reviewing_completed_trick() {
            act(&mut table, Actor::Device, Action::ContinueTrick);
        } else {
            assert_ne!(
                board.hand(0).len(),
                1,
                "the human never plays the last card"
            );
            let card = board.legal_cards(0)[0];
            act(&mut table, Actor::Device, card_action(card));
        }
    }
    let board = table.board().unwrap();
    assert_eq!(board.completed_tricks(), 8);
    let result = board.round_result().unwrap();
    let score = table.match_score().unwrap();
    assert_eq!(
        result.north_south_awarded + result.east_west_awarded,
        score.north_south() + score.east_west()
    );
}

#[test]
fn team_scores_accumulate_round_after_round() {
    let mut table = solo(Variant::Contree, 4);
    let (mut north_south, mut east_west) = (0, 0);
    // A coinched round with announcements can be worth 1,000 points, so the match may end before the third.
    for round in 1..=3 {
        if table.match_score().unwrap().complete() {
            break;
        }
        if round > 1 {
            act(&mut table, Actor::Device, Action::NextRound);
        }
        finish_auction_at_160(&mut table, Actor::Device);
        let result = play_round(&mut table, Actor::Device);
        north_south += result.north_south_awarded;
        east_west += result.east_west_awarded;
        let score = table.match_score().unwrap();
        assert_eq!(
            score.north_south(),
            north_south,
            "North–South after round {round}"
        );
        assert_eq!(
            score.east_west(),
            east_west,
            "East–West after round {round}"
        );
    }
}

#[test]
fn the_match_ends_at_one_thousand_points_and_a_rematch_starts_afresh() {
    let mut table = solo(Variant::Contree, 5);
    play_match(&mut table, Actor::Device);
    let score = table.match_score().unwrap();
    assert!(score.north_south().max(score.east_west()) >= 1000);
    let winner = if score.north_south() > score.east_west() {
        Team::NorthSouth
    } else {
        Team::EastWest
    };
    assert_eq!(score.winner(), Some(winner));
    assert_eq!(
        refusal(table.apply(Actor::Device, Action::NextRound, T0)),
        "This match has ended. Start a rematch."
    );

    act(&mut table, Actor::Device, Action::Rematch);
    let score = table.match_score().unwrap();
    assert_eq!(score.north_south() + score.east_west(), 0);
    assert!(!score.complete());
    assert!(table.bidding().is_some());
}

#[test]
fn a_won_match_is_handed_over_once_with_the_account_on_the_human_seat() {
    let account = Uuid::new_v4();
    let mut table = solo_with(
        Variant::Contree,
        Difficulty::Relaxed,
        true,
        Some(account),
        setup(6),
    );
    let outcomes = play_match(&mut table, Actor::Device);
    assert_eq!(finished_count(&outcomes), 1);
    assert!(
        outcomes.last().unwrap().finished.is_some(),
        "nothing is handed over before the match ends"
    );

    let finished = outcomes
        .into_iter()
        .find_map(|outcome| outcome.finished)
        .unwrap();
    let score = table.match_score().unwrap();
    assert_eq!(finished.mode, Mode::Solo);
    assert_eq!(finished.variant, Variant::Contree);
    assert_eq!(finished.difficulty, Some(Difficulty::Relaxed));
    assert_eq!(finished.north_south_score, score.north_south());
    assert_eq!(finished.east_west_score, score.east_west());
    assert_eq!(Some(finished.winning_team), score.winner());
    assert_eq!(
        finished.seats[0],
        FinishedSeat {
            account: Some(account),
            name: "You".into(),
            bot: false
        }
    );
    assert!(
        finished.seats[1..]
            .iter()
            .all(|seat| seat.account.is_none() && seat.bot)
    );
    assert_eq!(
        finished.north_south_score,
        finished
            .rounds
            .iter()
            .map(|round| round.result.north_south_awarded)
            .sum::<i32>()
    );
    assert_eq!(
        finished.east_west_score,
        finished
            .rounds
            .iter()
            .map(|round| round.result.east_west_awarded)
            .sum::<i32>()
    );
    assert!(
        finished
            .rounds
            .iter()
            .all(|round| round.contract_value.is_some())
    );
    assert!(finished.announcements);

    act(&mut table, Actor::Device, Action::Rematch);
    let rematch = play_match(&mut table, Actor::Device);
    let second = rematch
        .into_iter()
        .find_map(|outcome| outcome.finished)
        .unwrap();
    assert_ne!(second.id, finished.id, "a rematch is another match");
}

#[test]
fn bots_play_the_strategy_of_the_tables_difficulty() {
    for difficulty in [Difficulty::Relaxed, Difficulty::Challenging] {
        let table = solo_with(
            Variant::Contree,
            difficulty,
            true,
            None,
            TableSetup::seeded(7),
        );
        assert!(std::ptr::addr_eq(
            table.strategy(),
            strategies::for_difficulty(difficulty)
        ));
        assert_eq!(
            table.needs_blocking_bot(),
            difficulty == Difficulty::Challenging
        );
    }
    let online = private(Variant::Contree, None, TableSetup::seeded(7));
    assert!(std::ptr::addr_eq(
        online.strategy(),
        strategies::for_tables()
    ));
    assert!(!online.needs_blocking_bot(), "no bot sits at the table yet");
}

#[test]
fn bots_take_classic_contracts_and_play_up_to_the_humans_first_card() {
    let mut table = solo(Variant::Classic, 8);
    for round in 1..=6 {
        if table.match_score().unwrap().complete() {
            break;
        }
        if round > 1 {
            act(&mut table, Actor::Device, Action::NextRound);
        }
        for guard in 0.. {
            assert!(guard <= 40, "the bots never took a contract");
            if auction_complete(&table) {
                break;
            }
            act(&mut table, Actor::Device, Action::Pass);
        }
        let board = table.board().unwrap();
        assert!(
            board.reviewing_completed_trick() || !board.legal_cards(0).is_empty(),
            "after a bot's contract, the bots play up to the human's first card"
        );
        play_round(&mut table, Actor::Device);
    }
}

#[test]
fn next_round_and_rematch_keep_the_all_trumps_choice() {
    let mut table = Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(
            local_seats(None).unwrap(),
            Variant::Contree,
            true,
            false,
            1_000,
        ),
        setup(9),
        T0,
    );
    assert!(!table.bidding().unwrap().all_trumps());
    finish_auction_at_80(&mut table, Actor::Device);
    play_round(&mut table, Actor::Device);
    act(&mut table, Actor::Device, Action::NextRound);
    assert!(!table.bidding().unwrap().all_trumps());
    play_match(&mut table, Actor::Device);
    act(&mut table, Actor::Device, Action::Rematch);
    assert!(!table.bidding().unwrap().all_trumps());
}

#[test]
fn next_round_and_rematch_keep_the_announcements_choice() {
    let mut table = solo_with(Variant::Contree, Difficulty::Relaxed, false, None, setup(9));
    finish_auction_at_80(&mut table, Actor::Device);
    assert!(!table.board().unwrap().play_view(0).announcements);
    play_round(&mut table, Actor::Device);
    act(&mut table, Actor::Device, Action::NextRound);
    finish_auction_at_80(&mut table, Actor::Device);
    assert!(!table.board().unwrap().play_view(0).announcements);
    play_match(&mut table, Actor::Device);
    act(&mut table, Actor::Device, Action::Rematch);
    finish_auction_at_80(&mut table, Actor::Device);
    assert!(!table.board().unwrap().play_view(0).announcements);
}

#[test]
fn a_solo_match_ends_at_its_target_and_the_rematch_keeps_it() {
    let mut table = Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(
            local_seats(None).unwrap(),
            Variant::Classic,
            true,
            true,
            500,
        ),
        setup(9),
        T0,
    );
    assert_eq!(table.match_score().unwrap().target(), 500);
    play_match(&mut table, Actor::Device);
    let score = table.match_score().unwrap();
    assert!(score.north_south().max(score.east_west()) >= 500);
    assert!(
        score.north_south().max(score.east_west()) < 500 + 500,
        "the match ended at its first round past 500"
    );
    act(&mut table, Actor::Device, Action::Rematch);
    assert_eq!(table.match_score().unwrap().target(), 500);
    finish_auction(&mut table, Actor::Device);
    play_round(&mut table, Actor::Device);
    act(&mut table, Actor::Device, Action::NextRound);
    assert_eq!(table.match_score().unwrap().target(), 500);
}

#[test]
fn a_private_match_plays_to_the_owners_target() {
    let mut table = private(Variant::Classic, None, setup(42));
    act(
        &mut table,
        Actor::Seat(0),
        Action::Settings {
            announcements: None,
            all_trumps: None,
            turn_timer: None,
            target: Some(2_000),
        },
    );
    act(&mut table, Actor::Seat(0), Action::Ready { ready: true });
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );
    assert_eq!(table.lobby().target(), 2_000);
    assert_eq!(table.match_score().unwrap().target(), 2_000);
}

#[test]
fn contree_bid_starts_a_contract_board_after_bot_players_pass() {
    let mut table = solo(Variant::Contree, 10);
    assert_eq!(table.bidding().unwrap().hand(0).len(), 8);
    act(
        &mut table,
        Actor::Device,
        Action::Contract {
            value: 160,
            suit: Some(Trump::Spades),
        },
    );
    finish_auction_at_160(&mut table, Actor::Device);
    let board = table.board().unwrap();
    assert_eq!(board.variant(), Variant::Contree);
    assert_eq!(board.trump(), Trump::Spades);
    assert!(board.contract_value() >= 160);
}

#[test]
fn a_contract_needs_a_suit() {
    let mut table = solo(Variant::Contree, 10);
    let action = Action::Contract {
        value: 90,
        suit: None,
    };
    assert_eq!(
        refusal(table.apply(Actor::Device, action, T0)),
        "Choose a trump suit for the contract."
    );
}

#[test]
fn auction_comes_back_to_the_human_when_the_bot_partner_supports_their_bid() {
    for seed in 0..200 {
        let mut table = solo(Variant::Contree, 1000 + seed);
        act(
            &mut table,
            Actor::Device,
            Action::Contract {
                value: 80,
                suit: Some(Trump::Spades),
            },
        );
        let bidding = table.bidding().unwrap();
        // Retry the deals where the partner did not support the bid, an opponent overcalled, or the last
        // opponent coinched the partner's bid, which ends the auction.
        if bidding.highest_bidder() != Some(2)
            || bidding.highest_bid_suit() != Some(Trump::Spades)
            || bidding
                .auction()
                .iter()
                .any(|call| call.r#type == CallType::Coinche)
        {
            continue;
        }
        assert!(!auction_complete(&table));
        assert_eq!(
            bidding.active_seat(),
            0,
            "the auction comes back to the human"
        );
        return;
    }
    panic!("the bot partner never supported the human's bid");
}

#[test]
fn dealer_and_first_bidder_rotate_every_round_and_bots_bid_before_the_human() {
    for seed in 0..100 {
        let mut table = solo(Variant::Classic, 2000 + seed);
        assert_eq!(table.bidding().unwrap().dealer(), 3);
        assert_eq!(table.bidding().unwrap().active_seat(), 0);
        finish_auction(&mut table, Actor::Device);
        play_round(&mut table, Actor::Device);
        act(&mut table, Actor::Device, Action::NextRound);
        assert_eq!(table.bidding().unwrap().dealer(), 0);
        // The three bots speak before the human; retry the deals where one of them takes.
        if auction_complete(&table) {
            continue;
        }
        assert_eq!(table.bidding().unwrap().active_seat(), 0);
        return;
    }
    panic!("a bot took the contract in every deal");
}

#[test]
fn bots_play_first_when_they_lead_the_trick() {
    'deal: for seed in 0..100 {
        let mut table = solo(Variant::Classic, 3000 + seed);
        for _ in 0..2 {
            finish_auction(&mut table, Actor::Device);
            play_round(&mut table, Actor::Device);
            if table.match_score().unwrap().complete() {
                continue 'deal;
            }
            act(&mut table, Actor::Device, Action::NextRound);
        }
        // The dealer is now seat 1, so seats 2 and 3 (bots) speak first; retry the deals where a bot takes.
        assert_eq!(table.bidding().unwrap().dealer(), 1);
        if auction_complete(&table) {
            continue;
        }
        let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
        act(&mut table, Actor::Device, Action::Trump { suit });
        let board = table.board().unwrap();
        assert_eq!(board.active_seat(), 0);
        assert_eq!(board.visible_trick().len(), 2);
        return;
    }
    panic!("the bots took the contract in every deal");
}

#[test]
fn a_local_round_cannot_be_dealt_again_before_it_ends() {
    let mut table = solo(Variant::Contree, 11);
    finish_auction_at_160(&mut table, Actor::Device);
    assert_eq!(
        refusal(table.apply(Actor::Device, Action::NextRound, T0)),
        "The current round is not finished."
    );
}

// PassAndPlayServiceTest

/// Four humans play a whole Contrée match. The device always shows the hand of the human whose turn it is, and a
/// completed trick stays with the human who played its last card. The match is not handed over.
#[test]
fn the_device_shows_the_hand_of_the_human_whose_turn_it_is() {
    let mut table = pass_and_play(
        Variant::Contree,
        [Some("Ana"), Some("Ben"), Some("Chloé"), Some("David")],
        setup(12),
    );
    let mut outcomes = Vec::new();
    for round in 1.. {
        assert!(round <= 20, "the match did not end after 20 rounds");
        if table.match_score().unwrap().complete() {
            break;
        }
        if round > 1 {
            outcomes.push(act(&mut table, Actor::Device, Action::NextRound));
        }
        for guard in 0.. {
            assert!(guard <= 20, "the auction did not complete");
            if auction_complete(&table) {
                break;
            }
            let bidding = table.bidding().unwrap();
            assert_eq!(
                table.viewer(),
                bidding.active_seat(),
                "the viewer is the player to speak"
            );
            let action = if bidding.highest_bid() == 0 {
                Action::Contract {
                    value: 80,
                    suit: Some(Trump::Hearts),
                }
            } else {
                Action::Pass
            };
            outcomes.push(act(&mut table, Actor::Device, action));
        }
        let mut last_player = None;
        for guard in 0.. {
            assert!(guard <= 40, "the round did not finish");
            let board = table.board().unwrap();
            if board.round_result().is_some() {
                break;
            }
            if board.reviewing_completed_trick() {
                assert_eq!(
                    Some(table.viewer()),
                    last_player,
                    "the trick stays with its last player"
                );
                outcomes.push(act(&mut table, Actor::Device, Action::ContinueTrick));
            } else {
                assert_eq!(table.viewer(), board.active_seat(), "the viewer plays next");
                last_player = Some(board.active_seat());
                let card = board.legal_cards(board.active_seat())[0];
                outcomes.push(act(&mut table, Actor::Device, card_action(card)));
            }
        }
    }
    assert_eq!(
        finished_count(&outcomes),
        0,
        "pass-and-play matches are not handed over"
    );
}

/// Ana and Chloé play against two bots in classic Belote; a bot's turn never shows its hand.
#[test]
fn bots_play_their_turns_between_the_humans() {
    let challenging =
        TableSetup::seeded(13).with_strategy(strategies::for_difficulty(Difficulty::Challenging));
    let mut table = pass_and_play(
        Variant::Classic,
        [Some("Ana"), None, Some("Chloé"), None],
        challenging,
    );
    for guard in 0.. {
        assert!(guard <= 20, "the auction did not complete");
        if auction_complete(&table) {
            break;
        }
        assert_eq!(
            table.lobby().seat(table.viewer()).unwrap().kind,
            SeatKind::Human
        );
        let bidding = table.bidding().unwrap();
        let action = if bidding.round() == 1 {
            Action::Trump {
                suit: bidding.upturned_card().unwrap().suit,
            }
        } else {
            Action::Pass
        };
        act(&mut table, Actor::Device, action);
    }
    for guard in 0.. {
        assert!(guard <= 40, "the round did not finish");
        let board = table.board().unwrap();
        if board.round_result().is_some() {
            break;
        }
        assert_eq!(
            table.lobby().seat(table.viewer()).unwrap().kind,
            SeatKind::Human
        );
        let action = if board.reviewing_completed_trick() {
            Action::ContinueTrick
        } else {
            card_action(board.legal_cards(board.active_seat())[0])
        };
        act(&mut table, Actor::Device, action);
    }
}

#[test]
fn device_acts_for_whoever_is_to_play() {
    let mut table = pass_and_play(
        Variant::Contree,
        [Some("Ana"), None, Some("Ben"), None],
        setup(14),
    );
    finish_auction_at_80(&mut table, Actor::Device);
    let board = table.board().unwrap();
    if board.reviewing_completed_trick() {
        act(&mut table, Actor::Device, Action::ContinueTrick);
    }
    let board = table.board().unwrap();
    let human = board.active_seat();
    assert!([0, 2].contains(&human));
    let card = board.legal_cards(human)[0];
    act(&mut table, Actor::Device, card_action(card));
    assert!(
        !table.board().unwrap().hand(human).contains(&card),
        "the active human played the card"
    );
}

#[test]
fn pass_and_play_keeps_the_announcements_choice() {
    let names: Vec<Option<String>> = vec![Some("Ana".into()), None, Some("Ben".into()), None];
    let seats = local_seats(Some(&names)).unwrap();
    let mut table = Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(seats, Variant::Contree, false, true, 1_000),
        setup(15),
        T0,
    );
    finish_auction_at_80(&mut table, Actor::Device);
    assert!(!table.board().unwrap().play_view(0).announcements);
}

// PrivateTableServiceTest (game flow)

fn four_ready_players(variant: Variant, setup: TableSetup) -> Table {
    let mut table = private(variant, None, setup);
    for name in ["Benoit", "Chloe", "David"] {
        table.join(name.into(), None, T0).unwrap();
    }
    for seat in 0..4 {
        act(&mut table, Actor::Seat(seat), Action::Ready { ready: true });
    }
    table
}

#[test]
fn owner_can_start_only_when_four_players_are_ready() {
    let mut table = private(Variant::Classic, None, setup(20));
    for name in ["Benoit", "Chloe", "David"] {
        table.join(name.into(), None, T0).unwrap();
    }
    assert!(
        table
            .apply(
                Actor::Seat(0),
                Action::Start {
                    fill_with_bots: false
                },
                T0
            )
            .is_err()
    );
    for seat in 0..4 {
        act(&mut table, Actor::Seat(seat), Action::Ready { ready: true });
    }
    assert_eq!(
        refusal(table.apply(
            Actor::Seat(1),
            Action::Start {
                fill_with_bots: false
            },
            T0
        )),
        "Only the table owner can start the game."
    );
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: false,
        },
    );
    assert_eq!(table.lobby().status(), Status::InProgress);
    assert!(table.bidding().is_some());
}

#[test]
fn started_contree_table_shares_an_eight_card_auction_between_players() {
    let mut table = four_ready_players(Variant::Contree, setup(21));
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: false,
        },
    );
    assert_eq!(table.bidding().unwrap().hand(0).len(), 8);
    act(
        &mut table,
        Actor::Seat(0),
        Action::Contract {
            value: 80,
            suit: Some(Trump::Hearts),
        },
    );
    let bidding = table.bidding().unwrap();
    assert_eq!(bidding.highest_bid(), 80);
    assert!(bidding.can_coinche(1));
    assert_eq!(
        refusal(table.apply(Actor::Seat(3), Action::Pass, T0)),
        "It is not your turn to bid."
    );
}

#[test]
fn starting_an_active_table_cannot_replace_its_auction() {
    let mut table = four_ready_players(Variant::Contree, setup(22));
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: false,
        },
    );
    act(
        &mut table,
        Actor::Seat(0),
        Action::Contract {
            value: 100,
            suit: Some(Trump::Spades),
        },
    );
    assert_eq!(
        refusal(table.apply(
            Actor::Seat(0),
            Action::Start {
                fill_with_bots: false
            },
            T0
        )),
        "This table has already started."
    );
    assert_eq!(table.bidding().unwrap().highest_bid(), 100);
}

#[test]
fn owner_can_start_with_bots_filling_any_number_of_empty_seats() {
    let mut table = private(Variant::Classic, None, setup(23));
    table.join("Benoit".into(), None, T0).unwrap();
    act(&mut table, Actor::Seat(0), Action::Ready { ready: true });
    act(&mut table, Actor::Seat(1), Action::Ready { ready: true });
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );
    assert_eq!(table.lobby().status(), Status::InProgress);
    let bots: Vec<_> = table
        .lobby()
        .occupied()
        .filter(|(_, seat)| seat.connection == Connection::BotTakeover)
        .collect();
    assert_eq!(bots.len(), 2);
    assert!(bots.iter().all(|(_, seat)| seat.ready));
}

#[test]
fn players_choose_their_seats_and_bots_take_the_remaining_ones() {
    let mut table = private(Variant::Classic, None, setup(24));
    let partner = table.join("Benoit".into(), None, T0).unwrap();
    act(
        &mut table,
        Actor::Seat(partner),
        Action::Seat { position: 2 },
    );
    act(&mut table, Actor::Seat(0), Action::Ready { ready: true });
    act(&mut table, Actor::Seat(2), Action::Ready { ready: true });
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );
    let lobby = table.lobby();
    assert_eq!(lobby.seat(0).unwrap().name, "Ana");
    assert_eq!(lobby.seat(1).unwrap().connection, Connection::BotTakeover);
    assert_eq!(lobby.seat(2).unwrap().name, "Benoit");
    assert_eq!(lobby.seat(3).unwrap().connection, Connection::BotTakeover);
}

#[test]
fn classic_table_with_bots_returns_control_to_the_owner_until_someone_takes() {
    let mut table = private_with_bots(Variant::Classic, setup(25));
    assert_eq!(table.bidding().unwrap().round(), 1);
    for guard in 0.. {
        assert!(guard <= 40, "the bots never took a contract");
        if auction_complete(&table) {
            break;
        }
        assert_eq!(
            table.bidding().unwrap().active_seat(),
            0,
            "control returns to the only human"
        );
        act(&mut table, Actor::Seat(0), Action::Pass);
    }
    let board = table.board().unwrap();
    assert!(
        board.reviewing_completed_trick() || board.active_seat() == 0,
        "after a bot takes, the bots play up to the owner's first card"
    );
}

#[test]
fn bots_automatically_play_a_full_contree_round_around_the_human() {
    let mut table = private_with_bots(Variant::Contree, setup(26));
    finish_auction_at_160(&mut table, Actor::Seat(0));
    play_round(&mut table, Actor::Seat(0));
    assert_eq!(table.board().unwrap().completed_tricks(), 8);
}

#[test]
fn a_completed_trick_is_collected_once_everyone_had_time_to_see_it() {
    let review = Duration::from_secs(4);
    let mut table = private_with_bots(Variant::Contree, setup(27));
    finish_auction_at_160(&mut table, Actor::Seat(0));
    let mut shown_at = T0;
    for minute in 1.. {
        let board = table.board().unwrap();
        if board.reviewing_completed_trick() {
            break;
        }
        assert!(
            table
                .trick_review_due(T0 + Duration::from_secs(3600), review)
                .is_none()
        );
        shown_at = T0 + Duration::from_secs(60 * minute);
        let card = board.legal_cards(0)[0];
        table
            .apply(Actor::Seat(0), card_action(card), shown_at)
            .unwrap();
    }
    assert_eq!(table.trick_review_due(shown_at, review), None);
    assert_eq!(
        table.trick_review_due(shown_at + Duration::from_millis(3900), review),
        None,
        "the trick stays on the table during the review time"
    );
    let due = table.trick_review_due(shown_at + review, review);
    assert_eq!(due, Some(1));

    let version = table.version();
    table.collect_trick(2, shown_at + review);
    assert!(
        table.board().unwrap().reviewing_completed_trick(),
        "a stale count changes nothing"
    );
    assert_eq!(table.version(), version);

    table.collect_trick(1, shown_at + review);
    let board = table.board().unwrap();
    assert!(!board.reviewing_completed_trick());
    assert_eq!(board.completed_tricks(), 1);
    assert_eq!(
        board.active_seat(),
        0,
        "bots play up to the owner's turn once the trick is collected"
    );
    assert!(table.version() > version);
}

#[test]
fn local_tables_have_no_trick_review_timer() {
    let mut table = solo(Variant::Classic, 28);
    let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
    act(&mut table, Actor::Device, Action::Trump { suit });
    let card = table.board().unwrap().legal_cards(0)[0];
    act(&mut table, Actor::Device, card_action(card));
    assert!(table.board().unwrap().reviewing_completed_trick());
    assert_eq!(
        table.trick_review_due(T0 + Duration::from_secs(60), Duration::from_secs(4)),
        None
    );
}

#[test]
fn players_can_deal_several_rounds_and_the_match_score_accumulates() {
    let mut table = private_with_bots(Variant::Contree, setup(29));
    finish_auction_at_160(&mut table, Actor::Seat(0));
    assert_eq!(
        refusal(table.apply(Actor::Seat(0), Action::NextRound, T0)),
        "The current round is not finished."
    );
    let dealer = table.bidding().unwrap().dealer();
    let result = play_round(&mut table, Actor::Seat(0));
    let mut total = result.north_south_awarded + result.east_west_awarded;
    for round in 2..=3 {
        if table.match_score().unwrap().complete() {
            break;
        }
        act(&mut table, Actor::Seat(0), Action::NextRound);
        assert_eq!(
            table.bidding().unwrap().dealer(),
            (dealer + round - 1) % 4,
            "the deal passes to the left"
        );
        assert_eq!(table.bidding().unwrap().hand(0).len(), 8);
        finish_auction_at_160(&mut table, Actor::Seat(0));
        let result = play_round(&mut table, Actor::Seat(0));
        total += result.north_south_awarded + result.east_west_awarded;
    }
    let score = table.match_score().unwrap();
    assert_eq!(score.north_south() + score.east_west(), total);
}

#[test]
fn next_round_twice_deals_once() {
    let mut table = four_ready_players(Variant::Contree, setup(30));
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: false,
        },
    );
    // The four humans finish the auction and the round, each playing their own seat.
    for guard in 0.. {
        assert!(guard <= 20, "the auction did not complete");
        if auction_complete(&table) {
            break;
        }
        let seat = table.bidding().unwrap().active_seat();
        let action = if table.bidding().unwrap().highest_bid() == 0 {
            Action::Contract {
                value: 80,
                suit: Some(Trump::Hearts),
            }
        } else {
            Action::Pass
        };
        act(&mut table, Actor::Seat(seat), action);
    }
    loop {
        let board = table.board().unwrap();
        if board.round_result().is_some() {
            break;
        }
        let seat = board.active_seat();
        let action = if board.reviewing_completed_trick() {
            Action::ContinueTrick
        } else {
            card_action(board.legal_cards(seat)[0])
        };
        act(&mut table, Actor::Seat(seat), action);
    }
    let dealer = table.bidding().unwrap().dealer();
    act(&mut table, Actor::Seat(1), Action::NextRound);
    let deal = table.bidding().unwrap().hand(0).to_vec();
    let version = table.version();
    act(&mut table, Actor::Seat(3), Action::NextRound);
    let bidding = table.bidding().unwrap();
    assert_eq!(
        bidding.dealer(),
        (dealer + 1) % 4,
        "a second click on the same round deals nothing"
    );
    assert_eq!(bidding.hand(0), deal.as_slice());
    assert_eq!(table.version(), version, "a no-op is not a new version");
}

#[test]
fn next_round_waits_for_the_game_to_start() {
    let mut table = private(Variant::Classic, None, setup(31));
    assert_eq!(
        refusal(table.apply(Actor::Seat(0), Action::NextRound, T0)),
        "This game has not started."
    );
    assert_eq!(
        refusal(table.apply(Actor::Seat(0), Action::Pass, T0)),
        "This game has not started."
    );
}

#[test]
fn board_actions_wait_for_the_auction_to_end() {
    let mut table = private_with_bots(Variant::Contree, setup(32));
    assert_eq!(
        refusal(table.apply(Actor::Seat(0), Action::ContinueTrick, T0)),
        "The auction has not finished."
    );
}

#[test]
fn the_online_match_ends_at_one_thousand_points_and_a_rematch_starts_afresh() {
    let mut table = private_with_bots(Variant::Contree, setup(33));
    play_match(&mut table, Actor::Seat(0));
    let score = table.match_score().unwrap();
    assert!(score.north_south().max(score.east_west()) >= 1000);
    assert_eq!(
        refusal(table.apply(Actor::Seat(0), Action::NextRound, T0)),
        "This match has ended. Start a rematch."
    );
    act(&mut table, Actor::Seat(0), Action::Rematch);
    let score = table.match_score().unwrap();
    assert_eq!(score.north_south() + score.east_west(), 0);
    assert!(!score.complete());
}

#[test]
fn rematch_only_after_complete_match() {
    let mut table = private_with_bots(Variant::Contree, setup(34));
    finish_auction_at_160(&mut table, Actor::Seat(0));
    play_round(&mut table, Actor::Seat(0));
    let score = table.match_score().unwrap().clone();
    assert!(!score.complete());
    let version = table.version();
    act(&mut table, Actor::Seat(0), Action::Rematch);
    assert_eq!(table.match_score().unwrap(), &score, "the match goes on");
    assert!(
        table.board().unwrap().round_result().is_some(),
        "no round is dealt"
    );
    assert_eq!(table.version(), version);
}

#[test]
fn a_won_private_match_is_handed_over_with_the_owners_account() {
    let account = Uuid::new_v4();
    let mut table = private(Variant::Classic, Some(account), setup(35));
    act(&mut table, Actor::Seat(0), Action::Ready { ready: true });
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );
    let outcomes = play_match(&mut table, Actor::Seat(0));
    assert_eq!(finished_count(&outcomes), 1);
    let finished = outcomes
        .into_iter()
        .find_map(|outcome| outcome.finished)
        .unwrap();
    assert_eq!(finished.mode, Mode::Private);
    assert_eq!(finished.variant, Variant::Classic);
    assert_eq!(finished.difficulty, None);
    assert_eq!(
        finished.seats[0],
        FinishedSeat {
            account: Some(account),
            name: "Ana".into(),
            bot: false
        }
    );
    assert!(
        finished.seats[1..]
            .iter()
            .all(|seat| seat.bot && seat.account.is_none())
    );
    assert!(
        finished
            .rounds
            .iter()
            .all(|round| round.contract_value.is_none()),
        "classic Belote has no contract value"
    );
}

#[test]
fn a_won_public_match_is_handed_over_as_public() {
    let account = Uuid::new_v4();
    let lobby = Lobby::public(
        "Ana".into(),
        Some(account),
        Variant::Contree,
        T0 + Duration::from_secs(60),
    );
    let mut table = Table::online(
        Uuid::new_v4(),
        TableKind::Public,
        None,
        lobby,
        setup(36),
        T0,
    );
    assert!(table.fill_with_bots_if_due(T0 + Duration::from_secs(3600)));
    assert!(
        table.bidding().is_some(),
        "the match begins once bots sit down"
    );
    let outcomes = play_match(&mut table, Actor::Seat(0));
    let finished = outcomes
        .into_iter()
        .find_map(|outcome| outcome.finished)
        .unwrap();
    assert_eq!(finished.mode, Mode::Public);
    assert_eq!(finished.seats[0].account, Some(account));
}

#[test]
fn a_released_account_is_replaced_by_a_bot_in_a_match() {
    let (deleted, kept) = (Uuid::new_v4(), Uuid::new_v4());
    let mut table = private(Variant::Classic, Some(kept), setup(37));
    let ben = table.join("Ben".into(), Some(deleted), T0).unwrap();
    act(&mut table, Actor::Seat(0), Action::Ready { ready: true });
    act(&mut table, Actor::Seat(ben), Action::Ready { ready: true });
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );

    let version = table.version();
    let outcome = table.release_account(deleted, T0);
    assert!(!outcome.removed);
    assert!(table.version() > version);
    let seat = table.lobby().seat(ben).unwrap();
    assert_eq!(seat.name, DELETED_PLAYER);
    assert_eq!(seat.connection, Connection::BotTakeover);
    assert_eq!(seat.account, None);

    let outcomes = play_match(&mut table, Actor::Seat(0));
    let finished = outcomes
        .into_iter()
        .find_map(|outcome| outcome.finished)
        .unwrap();
    assert_eq!(
        finished.seats[ben],
        FinishedSeat {
            account: None,
            name: DELETED_PLAYER.into(),
            bot: true
        }
    );
    assert_eq!(finished.seats[0].account, Some(kept));
}

#[test]
fn a_released_account_leaves_a_waiting_table() {
    let deleted = Uuid::new_v4();
    let mut table = private(Variant::Classic, None, setup(38));
    table.join("Ben".into(), Some(deleted), T0).unwrap();
    let outcome = table.release_account(deleted, T0);
    assert!(!outcome.removed);
    let names: Vec<&str> = table
        .lobby()
        .occupied()
        .map(|(_, seat)| seat.name.as_str())
        .collect();
    assert_eq!(names, ["Ana"]);
}

#[test]
fn a_released_owner_alone_at_a_waiting_table_removes_it() {
    let deleted = Uuid::new_v4();
    let mut table = private(Variant::Classic, Some(deleted), setup(39));
    assert!(table.release_account(deleted, T0).removed);
}

#[test]
fn an_account_not_at_the_table_changes_nothing() {
    let mut table = private(Variant::Classic, Some(Uuid::new_v4()), setup(40));
    let version = table.version();
    let outcome = table.release_account(Uuid::new_v4(), T0);
    assert!(!outcome.removed && outcome.finished.is_none());
    assert_eq!(table.version(), version);
}

#[test]
fn the_last_player_leaving_removes_the_table() {
    let mut table = private(Variant::Classic, None, setup(41));
    let ben = table.join("Ben".into(), None, T0).unwrap();
    assert!(!act(&mut table, Actor::Seat(0), Action::Leave).removed);
    assert_eq!(table.lobby().owner(), ben);
    assert!(act(&mut table, Actor::Seat(ben), Action::Leave).removed);
}

#[test]
fn settings_change_the_turn_timer_and_announcements() {
    let mut table = private(Variant::Classic, None, setup(42));
    act(
        &mut table,
        Actor::Seat(0),
        Action::Settings {
            announcements: Some(false),
            all_trumps: None,
            turn_timer: Some(30),
            target: None,
        },
    );
    assert!(!table.lobby().announcements());
    assert_eq!(table.lobby().turn_timer_seconds(), 30);
    act(&mut table, Actor::Seat(0), Action::Ready { ready: true });
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );
    finish_auction(&mut table, Actor::Seat(0));
    assert!(
        !table.board().unwrap().play_view(0).announcements,
        "the deal keeps the table's choice"
    );
}

#[test]
fn every_accepted_action_is_a_new_version_and_activity() {
    let mut table = private(Variant::Classic, None, setup(43));
    let version = table.version();
    let later = T0 + Duration::from_secs(90);
    table
        .apply(Actor::Seat(0), Action::Ready { ready: true }, later)
        .unwrap();
    assert_eq!(table.version(), version + 1);
    assert_eq!(table.last_activity(), later);
    assert!(
        table
            .apply(Actor::Seat(2), Action::Ready { ready: true }, T0)
            .is_err()
    );
    assert_eq!(table.version(), version + 1, "a refusal changes nothing");
}

#[test]
fn a_device_cannot_act_for_a_bot() {
    let mut table = solo(Variant::Classic, 44);
    let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
    act(&mut table, Actor::Device, Action::Trump { suit });
    let card = table.board().unwrap().legal_cards(0)[0];
    act(&mut table, Actor::Device, card_action(card));
    assert!(table.board().unwrap().reviewing_completed_trick());
    act(&mut table, Actor::Device, Action::ContinueTrick);
    let board = table.board().unwrap();
    assert_eq!(board.active_seat(), 0, "bots played up to the human");
}

/// Ben joins Ana's private table and both start with two bots; Ben's seat is position 1.
fn ana_and_ben(variant: Variant, setup: TableSetup) -> Table {
    let mut table = private(variant, None, setup);
    table.join("Ben".into(), None, T0).unwrap();
    act(&mut table, Actor::Seat(0), Action::Ready { ready: true });
    act(&mut table, Actor::Seat(1), Action::Ready { ready: true });
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );
    table
}

#[test]
fn a_bot_taking_over_during_a_trick_review_keeps_its_timer() {
    let review = Duration::from_secs(4);
    let timeout = Duration::from_secs(1);
    let mut table = ana_and_ben(Variant::Contree, setup(45));
    assert!(
        table.replace_expired_disconnections(T0, timeout).is_none(),
        "nobody is disconnected"
    );
    table.disconnect(1, T0).unwrap();
    assert!(
        table
            .replace_expired_disconnections(T0 + timeout, timeout)
            .is_some()
    );
    finish_auction_at_160(&mut table, Actor::Seat(0));
    for guard in 0.. {
        assert!(guard <= 8, "no trick was completed");
        let board = table.board().unwrap();
        if board.reviewing_completed_trick() {
            break;
        }
        let card = board.legal_cards(0)[0];
        act(&mut table, Actor::Seat(0), card_action(card));
    }
    let count = table.board().unwrap().completed_tricks();
    // Ana's seat goes to a bot 3 seconds into the review.
    table.disconnect(0, T0 + Duration::from_secs(2)).unwrap();
    assert!(
        table
            .replace_expired_disconnections(T0 + Duration::from_secs(3), timeout)
            .is_some()
    );
    assert_eq!(
        table.trick_review_due(T0 + review, review),
        Some(count),
        "the review time is not reset"
    );
}

#[test]
fn a_round_is_added_to_the_score_once_whatever_happens_after_it() {
    let timeout = Duration::from_secs(120);
    let mut table = ana_and_ben(Variant::Classic, setup(46));
    // Ana plays both human seats until the round ends.
    loop {
        let (seat, action) = match table.board() {
            None => {
                let bidding = table.bidding().unwrap();
                let seat = bidding.active_seat();
                let suit = bidding.upturned_card().unwrap().suit;
                let action = if bidding.round() == 1 {
                    Action::Trump { suit }
                } else {
                    Action::Trump {
                        suit: if suit == Suit::Clubs {
                            Suit::Spades
                        } else {
                            Suit::Clubs
                        },
                    }
                };
                (seat, action)
            }
            Some(board) if board.round_result().is_some() => break,
            Some(board) if board.reviewing_completed_trick() => (0, Action::ContinueTrick),
            Some(board) => {
                let seat = board.active_seat();
                (seat, card_action(board.legal_cards(seat)[0]))
            }
        };
        act(&mut table, Actor::Seat(seat), action);
    }
    let score = table.match_score().unwrap().clone();
    assert_eq!(score.rounds().len(), 1);
    table.disconnect(1, T0).unwrap();
    assert!(
        table
            .replace_expired_disconnections(T0 + timeout, timeout)
            .is_some()
    );
    assert_eq!(
        table.match_score().unwrap(),
        &score,
        "the round is not counted twice"
    );
}

/// Within a match, the next round is dealt from the finished round's tricks, gathered and cut
/// without a shuffle; a rematch starts from a shuffled deck (US-085).
#[test]
fn the_next_round_is_dealt_from_the_gathered_tricks_and_a_rematch_is_shuffled() {
    use beelot_game::deck::Gathering;

    let mut table = Table::local(
        Uuid::new_v4(),
        Difficulty::Relaxed,
        Lobby::local(
            local_seats(None).unwrap(),
            Variant::Contree,
            true,
            false,
            1_000,
        ),
        setup(9),
        T0,
    );
    assert_eq!(
        table.bidding().unwrap().deal_summary().gathering,
        Gathering::Shuffled
    );
    finish_auction_at_80(&mut table, Actor::Device);
    play_round(&mut table, Actor::Device);
    let next_dealer = (table.bidding().unwrap().dealer() + 1) % 4;
    let gathered = table.board().unwrap().gathered_deck(next_dealer).unwrap();

    act(&mut table, Actor::Device, Action::NextRound);

    let bidding = table.bidding().unwrap();
    let deal = bidding.deal_summary();
    assert_eq!(deal.gathering, Gathering::Tricks);
    assert_eq!(deal.dealer_seat, next_dealer);
    let cut = gathered.cut_at(deal.cut_lifted).cards;
    let first = (next_dealer + 1) % 4;
    assert_eq!(bidding.hand(first)[..3], cut[..3], "the first packet");

    play_match(&mut table, Actor::Device);
    act(&mut table, Actor::Device, Action::Rematch);
    assert_eq!(
        table.bidding().unwrap().deal_summary().gathering,
        Gathering::Shuffled
    );
}

/// The recap of US-093 travels with a finished match only, and matches the rounds the table kept.
#[test]
fn a_finished_match_carries_its_recap() {
    use beelot_server::api::{Viewer, snapshot};

    let mut table = solo(Variant::Classic, 3);
    let before = serde_json::to_value(snapshot(&table, Viewer::Device, T0)).unwrap();
    assert!(
        before["match"].get("recap").is_none(),
        "no recap while the match is in progress"
    );

    play_match(&mut table, Actor::Device);

    let after = serde_json::to_value(snapshot(&table, Viewer::Device, T0)).unwrap();
    assert_eq!(after["match"]["complete"], true);
    let rounds = table.match_score().unwrap().rounds();
    let recap = &after["match"]["recap"];
    assert_eq!(recap["rounds"], rounds.len());
    let biggest = rounds
        .iter()
        .flat_map(|round| {
            [
                round.result.north_south_awarded,
                round.result.east_west_awarded,
            ]
        })
        .max()
        .unwrap();
    assert_eq!(recap["biggestRound"]["points"], biggest);
}

/// The tricks of a finished round travel with its result (US-066), and a round in progress has no result.
#[test]
fn a_finished_round_carries_its_review() {
    use beelot_server::api::{Viewer, snapshot};

    let mut table = solo(Variant::Classic, 3);
    finish_auction(&mut table, Actor::Device);
    let before = serde_json::to_value(snapshot(&table, Viewer::Device, T0)).unwrap();
    assert!(before["board"]["roundResult"].is_null());

    play_round(&mut table, Actor::Device);

    let after = serde_json::to_value(snapshot(&table, Viewer::Device, T0)).unwrap();
    let review = after["board"]["roundResult"]["review"]
        .as_array()
        .expect("a review");
    assert_eq!(review.len(), 8);
    let mut seen = std::collections::HashSet::new();
    for (index, trick) in review.iter().enumerate() {
        let cards = trick["cards"].as_array().unwrap();
        assert_eq!(cards.len(), 4);
        for played in cards {
            assert!(played["seat"].as_u64().unwrap() < 4);
            assert!(
                seen.insert(played["card"].to_string()),
                "a card is played once"
            );
        }
        if let Some(next) = review.get(index + 1) {
            assert_eq!(
                trick["winner"], next["cards"][0]["seat"],
                "the winner leads the next trick"
            );
        }
    }
    assert_eq!(seen.len(), 32);
}

// US-114: an online rematch is a proposal that every connected human accepts.

/// A private Classic table with two humans (seats 0 and 1) and two bots, played to the end of the match by
/// whichever human is active.
fn finished_match_between_two_humans(seed: i64) -> Table {
    let mut table = private(Variant::Classic, None, setup(seed));
    table.join("Benoit".into(), None, T0).unwrap();
    for seat in 0..2 {
        act(&mut table, Actor::Seat(seat), Action::Ready { ready: true });
    }
    act(
        &mut table,
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: true,
        },
    );
    for guard in 0.. {
        assert!(guard <= 2000, "the match did not end");
        if table.match_score().unwrap().complete() {
            return table;
        }
        if let Some(board) = table.board() {
            if board.round_result().is_some() {
                act(&mut table, Actor::Seat(0), Action::NextRound);
            } else if board.reviewing_completed_trick() {
                act(&mut table, Actor::Seat(0), Action::ContinueTrick);
            } else {
                let seat = board.active_seat();
                let card = board.legal_cards(seat)[0];
                act(&mut table, Actor::Seat(seat), card_action(card));
            }
        } else {
            let bidding = table.bidding().unwrap();
            let seat = bidding.active_seat();
            let upturned = bidding.upturned_card().unwrap().suit;
            let suit = if bidding.round() == 1 {
                upturned
            } else if upturned == Suit::Clubs {
                Suit::Spades
            } else {
                Suit::Clubs
            };
            act(&mut table, Actor::Seat(seat), Action::Trump { suit });
        }
    }
    unreachable!()
}

#[test]
fn an_online_rematch_waits_for_every_connected_human() {
    let mut table = finished_match_between_two_humans(61);
    let version = table.version();
    act(&mut table, Actor::Seat(0), Action::Rematch);
    assert!(table.match_score().unwrap().complete(), "no new match yet");
    assert_eq!(table.rematch_voted(), &[0]);
    assert_eq!(table.rematch_pending(), vec![1]);
    assert!(
        table.version() > version,
        "the others are told of the proposal"
    );

    let version = table.version();
    act(&mut table, Actor::Seat(0), Action::Rematch);
    assert_eq!(table.version(), version, "asking twice changes nothing");

    act(&mut table, Actor::Seat(1), Action::Rematch);
    let score = table.match_score().unwrap();
    assert_eq!(score.north_south() + score.east_west(), 0);
    assert!(!score.complete());
    assert!(table.rematch_voted().is_empty());
}

#[test]
fn a_rematch_does_not_wait_for_a_disconnected_human() {
    let mut table = finished_match_between_two_humans(62);
    table.disconnect(1, T0).unwrap();
    act(&mut table, Actor::Seat(0), Action::Rematch);
    assert!(
        !table.match_score().unwrap().complete(),
        "the connected human alone starts it"
    );
}

fn random_dealer_table(variant: Variant, seed: i64) -> Table {
    solo_with(
        variant,
        Difficulty::Relaxed,
        true,
        None,
        setup(seed).with_seeded_first_dealer(seed),
    )
}

#[test]
fn the_first_dealer_of_a_match_follows_the_seed_and_covers_the_four_seats() {
    let mut seen = [false; 4];
    for seed in 0..60 {
        let first = random_dealer_table(Variant::Classic, seed)
            .bidding()
            .unwrap()
            .dealer();
        let again = random_dealer_table(Variant::Classic, seed)
            .bidding()
            .unwrap()
            .dealer();
        assert_eq!(first, again, "seed {seed} gave two first dealers");
        seen[first] = true;
    }
    assert_eq!(seen, [true; 4], "some seat never dealt first");
}

#[test]
fn a_table_without_a_first_dealer_draw_keeps_north_speaking_first() {
    let table = solo(Variant::Classic, 5);
    assert_eq!(table.bidding().unwrap().dealer(), 3);
}

#[test]
fn a_match_opened_by_a_bot_waits_for_the_human_only_on_the_humans_turn() {
    let mut opened_by_bot = 0;
    for seed in 0..60 {
        let table = random_dealer_table(Variant::Contree, seed);
        let bidding = table.bidding().unwrap();
        if bidding.dealer() == 3 {
            continue;
        }
        opened_by_bot += 1;
        // The bots between the dealer and the human have already called: nothing waits for a click on their turn.
        assert!(
            bidding.active_seat() == 0 || auction_complete(&table),
            "seed {seed}: the table waits on seat {}",
            bidding.active_seat()
        );
    }
    assert!(opened_by_bot > 0);
}

#[test]
fn the_dealer_still_rotates_after_a_random_first_dealer() {
    for seed in 0..20 {
        let mut table = random_dealer_table(Variant::Classic, seed);
        let first = table.bidding().unwrap().dealer();
        finish_auction(&mut table, Actor::Device);
        play_round(&mut table, Actor::Device);
        if table.match_score().unwrap().complete() {
            continue;
        }
        act(&mut table, Actor::Device, Action::NextRound);
        assert_eq!(table.bidding().unwrap().dealer(), (first + 1) % 4);
    }
}

// --- Undo (US-146) ---

fn solo_in_play(seed: i64) -> Table {
    let mut table = solo(Variant::Classic, seed);
    let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
    act(&mut table, Actor::Device, Action::Trump { suit });
    table
}

fn first_legal(table: &Table) -> Card {
    table.board().unwrap().legal_cards(0)[0]
}

fn state_of(table: &Table) -> (Vec<Card>, Vec<Card>, usize, usize) {
    let board = table.board().unwrap();
    (
        board.hand(0).to_vec(),
        board
            .visible_trick()
            .iter()
            .map(|played| played.card)
            .collect(),
        board.active_seat(),
        board.completed_tricks(),
    )
}

#[test]
fn undo_returns_the_card_and_the_bots_play_the_same_replies_again() {
    let mut table = solo_in_play(2);
    let before = state_of(&table);
    let card = first_legal(&table);
    act(&mut table, Actor::Device, card_action(card));
    let after = state_of(&table);
    assert_ne!(before, after);
    assert!(table.undo_offered());
    assert_eq!(table.undos_left(), 3);

    table
        .apply(Actor::Device, Action::Undo, T0 + time::Duration::seconds(2))
        .unwrap();
    assert_eq!(state_of(&table), before);
    assert!(!table.undo_offered());
    assert_eq!(table.undos_left(), 2);

    act(&mut table, Actor::Device, card_action(card));
    assert_eq!(state_of(&table), after);
}

#[test]
fn a_match_allows_three_undos() {
    let mut table = solo_in_play(2);
    for _ in 0..3 {
        let card = first_legal(&table);
        act(&mut table, Actor::Device, card_action(card));
        table.apply(Actor::Device, Action::Undo, T0).unwrap();
    }
    assert_eq!(table.undos_left(), 0);
    let card = first_legal(&table);
    act(&mut table, Actor::Device, card_action(card));
    assert!(!table.undo_offered());
    assert_eq!(
        refusal(table.apply(Actor::Device, Action::Undo, T0)),
        "No undo is left for this match."
    );
}

#[test]
fn an_undo_after_the_window_is_refused() {
    let mut table = solo_in_play(2);
    let card = first_legal(&table);
    act(&mut table, Actor::Device, card_action(card));
    let after = state_of(&table);
    assert_eq!(
        refusal(table.apply(
            Actor::Device,
            Action::Undo,
            T0 + time::Duration::seconds(30)
        )),
        "It is too late to undo that card."
    );
    assert_eq!(state_of(&table), after);
    assert_eq!(table.undos_left(), 3);
}

#[test]
fn only_a_card_can_be_undone() {
    let mut table = solo(Variant::Classic, 2);
    assert_eq!(
        refusal(table.apply(Actor::Device, Action::Undo, T0)),
        "There is nothing to undo."
    );
    let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
    act(&mut table, Actor::Device, Action::Trump { suit });
    assert_eq!(
        refusal(table.apply(Actor::Device, Action::Undo, T0)),
        "There is nothing to undo."
    );
    // Moving on from the trick makes the card final.
    let card = first_legal(&table);
    act(&mut table, Actor::Device, card_action(card));
    act(&mut table, Actor::Device, Action::ContinueTrick);
    assert!(!table.undo_offered());
    assert_eq!(
        refusal(table.apply(Actor::Device, Action::Undo, T0)),
        "There is nothing to undo."
    );
}

#[test]
fn pass_and_play_and_online_tables_have_no_undo() {
    let mut table = pass_and_play(
        Variant::Classic,
        [Some("Ana"), Some("Ben"), Some("Cleo"), Some("Dan")],
        setup(3),
    );
    assert_eq!(table.undos_left(), 0);
    assert_eq!(
        refusal(table.apply(Actor::Device, Action::Undo, T0)),
        "There is nothing to undo."
    );
    let mut online = private_with_bots(Variant::Classic, setup(4));
    assert_eq!(online.undos_left(), 0);
    assert!(online.apply(Actor::Seat(0), Action::Undo, T0).is_err());
}

// --- Why did the bot play that? (US-149) ---

#[test]
fn a_finished_solo_round_explains_the_bots_cards_from_their_own_views() {
    let mut table = solo(Variant::Classic, 2);
    let suit = table.bidding().unwrap().upturned_card().unwrap().suit;
    act(&mut table, Actor::Device, Action::Trump { suit });
    assert!(
        table.explanations(Actor::Device).is_err(),
        "nothing to explain mid-round"
    );
    play_round(&mut table, Actor::Device);
    let reasons = table.explanations(Actor::Device).unwrap();
    assert!(!reasons.is_empty());
    for reason in &reasons {
        assert_ne!(reason.seat, 0, "the human's own cards are not explained");
        assert!(reason.trick < 8 && reason.position < 4);
    }
    // Each reason points at a card that seat really played at that place.
    let tricks = table.review_input(Actor::Device).unwrap().tricks;
    for reason in &reasons {
        assert_eq!(tricks[reason.trick][reason.position].seat, reason.seat);
    }
}

#[test]
fn pass_and_play_and_online_tables_explain_nothing() {
    let table = pass_and_play(
        Variant::Classic,
        [Some("Ana"), Some("Ben"), Some("Cleo"), Some("Dan")],
        setup(3),
    );
    assert!(table.explanations(Actor::Device).is_err());
    let online = private_with_bots(Variant::Classic, setup(4));
    assert!(online.explanations(Actor::Seat(0)).is_err());

// --- The daily deal (US-150) ---

fn daily_table(seed: i64, account: Option<Uuid>) -> Table {
    Table::daily(
        Uuid::new_v4(),
        date!(2026 - 11 - 13),
        Variant::Classic,
        seed,
        account,
        T0,
    )
}

/// Plays the human's first legal cards until the round ends, and keeps what each move handed over.
fn play_round_keeping_outcomes(table: &mut Table) -> Vec<Outcome> {
    let mut outcomes = Vec::new();
    for guard in 0.. {
        assert!(guard <= 40, "the round did not finish");
        let board = table.board().expect("the auction is over");
        if board.round_result().is_some() {
            return outcomes;
        }
        let action = if board.reviewing_completed_trick() {
            Action::ContinueTrick
        } else {
            card_action(board.legal_cards(board.active_seat())[0])
        };
        outcomes.push(act(table, Actor::Device, action));
    }
    unreachable!()
}

#[test]
fn the_daily_deal_gives_everyone_the_same_cards() {
    let one = daily_table(77, None);
    let two = daily_table(77, Some(Uuid::new_v4()));
    let other = daily_table(78, None);
    assert_eq!(one.bidding().unwrap().hand(0), two.bidding().unwrap().hand(0));
    assert_eq!(
        one.bidding().unwrap().dealer(),
        two.bidding().unwrap().dealer()
    );
    assert_ne!(one.bidding().unwrap().hand(0), other.bidding().unwrap().hand(0));
}

#[test]
fn a_signed_in_daily_round_is_scored_once_and_there_is_no_next_round() {
    let account = Uuid::new_v4();
    let mut table = daily_table(77, Some(account));
    finish_auction(&mut table, Actor::Device);
    let outcomes = play_round_keeping_outcomes(&mut table);
    let scored: Vec<_> = outcomes.iter().filter_map(|outcome| outcome.daily).collect();
    assert_eq!(scored.len(), 1);
    assert_eq!(scored[0].account, account);
    assert_eq!(scored[0].day, date!(2026 - 11 - 13));
    let awarded = table
        .board()
        .unwrap()
        .round_result()
        .unwrap()
        .north_south_awarded;
    assert_eq!(scored[0].score, awarded);
    assert_eq!(
        refusal(table.apply(Actor::Device, Action::NextRound, T0)),
        "Today's daily deal is finished."
    );
}

#[test]
fn a_guests_daily_round_is_not_scored() {
    let mut table = daily_table(77, None);
    finish_auction(&mut table, Actor::Device);
    let outcomes = play_round_keeping_outcomes(&mut table);
    assert!(outcomes.iter().all(|outcome| outcome.daily.is_none()));
}
