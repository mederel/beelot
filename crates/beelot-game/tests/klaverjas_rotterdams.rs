//! Klaverjas, Rotterdam rules (US-214): the rule set of the table reaches the deal's board, the same
//! deal gives different legal plays under Amsterdams and Rotterdams, and the bots play whole
//! Rotterdams rounds without an illegal card.

use beelot_game::bidding::BiddingState;
use beelot_game::board::GameBoard;
use beelot_game::bot::strategies;
use beelot_game::bot::turns::play_turn;
use beelot_game::card::{Card, Difficulty, KlaverjasRules, Suit, Variant};
use beelot_game::error::GameError;
use beelot_game::rng::SplitMix64;
use beelot_game::rules::{IllegalReason, Trumping};

fn cards(codes: &str) -> Vec<Card> {
    codes.split(' ').map(|code| code.parse().unwrap()).collect()
}

fn card(code: &str) -> Card {
    code.parse().unwrap()
}

/// Hearts are trumps, North (seat 0) plays and leads, West (seat 3) dealt.
fn board(rules: KlaverjasRules) -> GameBoard {
    GameBoard::from_klaverjas(
        [
            cards("AS 7D JH 9H 10S 9S AC 10C"),
            cards("KS AD 10D JD QD KD 8H 10H"),
            cards("QS 8D QH KH AH 8S KC QC"),
            cards("JS 9D 7H 7S JC 9C 8C 7C"),
        ],
        Suit::Hearts,
        0,
        3,
        rules,
    )
}

fn play(board: &mut GameBoard, plays: &str) {
    for code in plays.split(' ') {
        let seat = board.active_seat();
        board
            .play(seat, card(code), false)
            .unwrap_or_else(|error| panic!("{code} from seat {seat}: {error}"));
        if board.reviewing_completed_trick() {
            board.continue_after_trick().unwrap();
        }
    }
}

/// Two tricks, then East leads the ten of diamonds, South trumps with the queen of hearts and West
/// discards: North, void in diamonds, is next while its partner is winning.
fn north_over_a_winning_partner(rules: KlaverjasRules) -> GameBoard {
    let mut board = board(rules);
    play(&mut board, "AS KS QS JS 7D AD 8D 9D 10D QH 7C");
    assert_eq!(board.active_seat(), 0);
    board
}

#[test]
fn the_same_deal_gives_different_legal_plays() {
    let amsterdams = north_over_a_winning_partner(KlaverjasRules::Amsterdams);
    assert_eq!(amsterdams.legal_cards(0), cards("JH 9H 10S 9S AC 10C"));

    let rotterdams = north_over_a_winning_partner(KlaverjasRules::Rotterdams);
    // North must beat its partner's queen of hearts: the jack or the nine.
    assert_eq!(rotterdams.legal_cards(0), cards("JH 9H"));
    assert!(
        rotterdams
            .illegal_cards(0)
            .contains(&(card("10C"), IllegalReason::MustTrump))
    );
}

#[test]
fn the_engine_rejects_a_discard_over_a_winning_partner_in_rotterdams() {
    let mut board = north_over_a_winning_partner(KlaverjasRules::Rotterdams);
    assert_eq!(
        board.play(0, card("10C"), false),
        Err(GameError::IllegalCard)
    );
    board.play(0, card("9H"), false).unwrap();
}

#[test]
fn the_rule_set_of_the_auction_reaches_the_board() {
    for (rules, trumping) in [
        (KlaverjasRules::Amsterdams, Trumping::Amsterdams),
        (KlaverjasRules::Rotterdams, Trumping::Rotterdams),
    ] {
        let mut state = BiddingState::new(Variant::Klaverjas, 3, Box::new(SplitMix64::new(5)))
            .with_klaverjas_rules(rules);
        state.choose_trump(0, Suit::Clubs).unwrap();
        assert_eq!(state.completed_board().unwrap().trumping(), trumping);
    }
    // Without a rule set, the table plays the Amsterdam rules.
    let mut state = BiddingState::new(Variant::Klaverjas, 3, Box::new(SplitMix64::new(5)));
    state.choose_trump(0, Suit::Clubs).unwrap();
    assert_eq!(
        state.completed_board().unwrap().trumping(),
        Trumping::Amsterdams
    );
}

#[test]
fn the_bots_play_whole_rotterdams_rounds_legally() {
    for difficulty in [Difficulty::Relaxed, Difficulty::Challenging] {
        let strategy = strategies::for_difficulty(difficulty);
        for seed in 0..12 {
            let mut state = BiddingState::new(
                Variant::Klaverjas,
                seed as usize % 4,
                Box::new(SplitMix64::new(seed)),
            )
            .with_klaverjas_rules(KlaverjasRules::Rotterdams);
            while state.completed_board().is_none() {
                let seat = state.active_seat();
                let decision = strategy.decide_auction(&state.auction_view(seat));
                state.apply(seat, decision).unwrap();
            }
            let mut board = state.into_board().unwrap();
            assert_eq!(board.trumping(), Trumping::Rotterdams);
            while board.round_result().is_none() {
                if board.reviewing_completed_trick() {
                    board.continue_after_trick().unwrap();
                } else {
                    // The engine refuses an illegal card, so this fails on any.
                    play_turn(&mut board, strategy).unwrap();
                }
            }
            let result = board.round_result().unwrap();
            let cards = result.north_south_card_points + result.east_west_card_points;
            assert_eq!(cards, 152, "{difficulty:?} seed {seed}");
        }
    }
}
