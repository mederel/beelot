//! Klaberjass (US-219): two seats, six cards and a turned-up card, nine tricks.

use beelot_game::bidding::{AuctionDecision, BiddingState};
use beelot_game::board::GameBoard;
use beelot_game::{Card, GameError, Rank, SplitMix64, Suit, Variant};

fn auction(seed: i64, dealer: usize) -> BiddingState {
    BiddingState::new(Variant::Klaberjass, dealer, Box::new(SplitMix64::new(seed)))
}

fn taken(seed: i64, dealer: usize) -> BiddingState {
    let mut bidding = auction(seed, dealer);
    let suit = bidding.upturned_card().expect("a turned-up card").suit;
    let first = bidding.active_seat();
    bidding.choose_trump(first, suit).unwrap();
    bidding
}

#[test]
fn deals_six_cards_each_and_turns_one_up() {
    let bidding = auction(1, 1);
    assert_eq!(Variant::Klaberjass.seat_count(), 2);
    assert_eq!(bidding.hand(0).len(), 6);
    assert_eq!(bidding.hand(1).len(), 6);
    assert!(bidding.hand(2).is_empty() && bidding.hand(3).is_empty());
    assert!(bidding.upturned_card().is_some());
    assert_eq!(bidding.active_seat(), 0, "the non-dealer speaks first");
}

#[test]
fn takes_the_turned_up_suit_and_deals_three_more_cards() {
    let bidding = taken(2, 0);
    let board = bidding.completed_board().expect("the auction is over");
    assert_eq!(board.hand(0).len(), 9);
    assert_eq!(board.hand(1).len(), 9);
    assert_eq!(board.tricks_per_round(), 9);
    assert_eq!(board.active_seat(), 1, "the non-dealer leads");
}

#[test]
fn the_second_round_names_another_suit_and_two_passes_after_it_redeal() {
    let mut bidding = auction(3, 1);
    let upturned = bidding.upturned_card().unwrap().suit;
    bidding.pass(0).unwrap();
    bidding.pass(1).unwrap();
    assert_eq!(bidding.round(), 2);
    assert_eq!(
        bidding.choose_trump(0, upturned),
        Err(GameError::MustChooseAnotherSuit)
    );
    bidding.pass(0).unwrap();
    bidding.pass(1).unwrap();
    assert_eq!(bidding.dealer(), 0, "the other player deals");
    assert_eq!(bidding.round(), 1);
    assert_eq!(bidding.hand(0).len(), 6);
}

#[test]
fn must_trump_when_it_cannot_follow_and_the_last_trick_is_worth_ten() {
    for seed in 0..40 {
        let mut board = taken(seed, seed as usize % 2).into_board().unwrap();
        let trump = board.trump();
        let mut last_points = 0;
        while board.round_result().is_none() {
            if board.reviewing_completed_trick() {
                board.continue_after_trick().unwrap();
                continue;
            }
            let seat = board.active_seat();
            let legal = board.legal_cards(seat);
            assert!(!legal.is_empty());
            let hand = board.hand(seat).to_vec();
            let led = board.visible_trick().first().map(|played| played.card.suit);
            if let Some(lead) = led {
                let can_follow = hand.iter().any(|card| card.suit == lead);
                let has_trump = hand.iter().any(|card| trump.is_trump(card.suit));
                if !can_follow && has_trump {
                    assert!(legal.iter().all(|card| trump.is_trump(card.suit)));
                }
            }
            board.play(seat, legal[0], false).unwrap();
            last_points = board.scores().0 + board.scores().1;
        }
        let result = board.round_result().unwrap();
        assert!(last_points > 0);
        assert_eq!(board.completed_tricks(), 9);
        assert_eq!(
            result.north_south_dix_de_der + result.east_west_dix_de_der,
            10
        );
    }
}

#[test]
fn the_taker_must_beat_the_other_player_or_loses_every_point() {
    let mut failures = 0;
    for seed in 0..60 {
        let mut board = taken(seed, 0).into_board().unwrap();
        while board.round_result().is_none() {
            if board.reviewing_completed_trick() {
                board.continue_after_trick().unwrap();
                continue;
            }
            let seat = board.active_seat();
            board.play(seat, board.legal_cards(seat)[0], false).unwrap();
        }
        let result = board.round_result().unwrap();
        if !result.contract_made {
            failures += 1;
            let taker_awarded = if board.declarer() == 0 {
                result.north_south_awarded
            } else {
                result.east_west_awarded
            };
            assert!(taker_awarded <= 20, "the taker keeps only a Belote");
        }
    }
    assert!(failures > 0, "some rounds fail the taker");
}

#[test]
fn a_hand_of_nine_without_the_right_size_is_refused() {
    let hands: [Vec<Card>; 4] = std::array::from_fn(|_| vec![Card::new(Rank::Ace, Suit::Clubs)]);
    let result = std::panic::catch_unwind(|| GameBoard::from_klaberjass(hands, Suit::Clubs, 0, 1));
    assert!(result.is_err());
}

#[test]
fn bidding_decisions_apply_through_the_shared_entry_point() {
    let mut bidding = auction(5, 1);
    let suit = bidding.upturned_card().unwrap().suit;
    bidding.apply(0, AuctionDecision::Trump { suit }).unwrap();
    assert!(bidding.completed_board().is_some());
}

#[test]
fn bots_play_whole_klaberjass_matches() {
    use beelot_game::bot::klaberjass;
    use beelot_game::match_score::MatchScore;
    let mut score = MatchScore::for_variant(Variant::Klaberjass);
    assert_eq!(score.target(), 500);
    let mut dealer = 0;
    for round in 0..200 {
        let mut bidding = auction(round, dealer);
        while bidding.completed_board().is_none() {
            let seat = bidding.active_seat();
            let decision = klaberjass::decide_auction(&bidding.auction_view(seat));
            bidding.apply(seat, decision).unwrap();
            dealer = bidding.dealer();
        }
        let mut board = bidding.into_board().unwrap();
        while board.round_result().is_none() {
            if board.reviewing_completed_trick() {
                board.continue_after_trick().unwrap();
                continue;
            }
            let seat = board.active_seat();
            let card = klaberjass::choose_card(&board.play_view(seat));
            board.play(seat, card, false).unwrap();
        }
        dealer = (dealer + 1) % 2;
        if score.record_summary(board.round_summary().unwrap()) {
            return;
        }
    }
    panic!("a match to 500 ends within 200 rounds");
}
