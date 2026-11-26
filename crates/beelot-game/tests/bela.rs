//! Bela (US-218): the 3 + 3 deal, the trump-or-dalje auction with a dealer who cannot pass, the
//! round that follows, and whole rounds played by the bots.

use beelot_game::bidding::{AuctionDecision, BiddingState, CallType};
use beelot_game::bot::strategies;
use beelot_game::bot::turns::play_turn;
use beelot_game::card::{Difficulty, Suit, Variant};
use beelot_game::error::GameError;
use beelot_game::match_score::default_target;
use beelot_game::rng::SplitMix64;

fn bela(dealer: usize, seed: i64) -> BiddingState {
    BiddingState::new(Variant::Bela, dealer, Box::new(SplitMix64::new(seed)))
}

#[test]
fn each_player_gets_six_cards_and_no_card_is_turned_up() {
    let state = bela(3, 1);
    for seat in 0..4 {
        assert_eq!(state.hand(seat).len(), 6);
    }
    assert_eq!(state.upturned_card(), None);
    assert_eq!(
        state.active_seat(),
        0,
        "the player after the dealer calls first"
    );
}

#[test]
fn the_first_suit_named_ends_the_auction_and_two_more_cards_are_dealt() {
    let mut state = bela(3, 2);
    state.pass(0).unwrap();
    state.choose_trump(1, Suit::Spades).unwrap();
    let board = state.completed_board().expect("the auction is over");
    assert_eq!(board.variant(), Variant::Bela);
    for seat in 0..4 {
        assert_eq!(board.hand(seat).len(), 8);
    }
    assert!(board.announcements(), "zvanje is always on in Bela");
    assert_eq!(board.declarer(), 1);
    assert_eq!(state.auction().len(), 2);
    assert_eq!(state.auction()[1].r#type, CallType::Trump);
}

#[test]
fn the_dealer_may_not_pass_and_must_name_a_suit() {
    let mut state = bela(3, 3);
    for seat in 0..3 {
        state.pass(seat).unwrap();
    }
    assert_eq!(state.pass(3), Err(GameError::DealerMustChooseTrump));
    assert!(state.completed_board().is_none());
    state.choose_trump(3, Suit::Clubs).unwrap();
    assert_eq!(state.completed_board().unwrap().declarer(), 3);
}

#[test]
fn only_the_active_seat_may_call() {
    let mut state = bela(3, 4);
    assert_eq!(state.pass(2), Err(GameError::NotYourTurn));
    assert_eq!(
        state.choose_trump(2, Suit::Hearts),
        Err(GameError::NotYourTurn)
    );
}

#[test]
fn a_bela_match_defaults_to_1000_points() {
    assert_eq!(default_target(Variant::Bela), 1_000);
}

#[test]
fn the_bots_play_whole_bela_rounds_and_every_round_adds_up_to_the_cards() {
    let strategy = strategies::for_difficulty(Difficulty::Challenging);
    for seed in 0..12 {
        let mut state = bela(seed as usize % 4, seed);
        while state.completed_board().is_none() {
            let seat = state.active_seat();
            let decision = strategy.decide_auction(&state.auction_view(seat));
            match decision {
                AuctionDecision::Trump { .. } | AuctionDecision::Pass => {
                    state.apply(seat, decision).unwrap();
                }
                other => panic!("a Bela bot made a {other:?}"),
            }
        }
        let mut board = state.into_board().unwrap();
        while board.round_result().is_none() {
            if board.reviewing_completed_trick() {
                board.continue_after_trick().unwrap();
            } else {
                play_turn(&mut board, strategy).unwrap();
            }
        }
        let result = board.round_result().unwrap();
        let cards = result.north_south_card_points + result.east_west_card_points;
        assert_eq!(
            cards, 152,
            "seed {seed}: the cards are worth 152, the last trick 10"
        );
    }
}
