//! Klaverjas, Amsterdam rules (US-213): the 3-2-3 deal, the play-or-pass auction with a dealer who
//! must play, a whole deal checked card by card against the rules written in the design
//! (`docs/superpowers/specs/2026-11-26-klaverjas-amsterdams-design.md`), and rounds and matches
//! played by the bots.

use beelot_game::bidding::{AuctionDecision, BiddingState, CallType};
use beelot_game::board::GameBoard;
use beelot_game::bot::strategies;
use beelot_game::bot::turns::play_turn;
use beelot_game::card::{Card, Difficulty, Suit, Team, Trump, Variant};
use beelot_game::error::GameError;
use beelot_game::match_score::default_target;
use beelot_game::rng::SplitMix64;
use beelot_game::rules::IllegalReason;

fn klaverjas(dealer: usize, seed: i64) -> BiddingState {
    BiddingState::new(Variant::Klaverjas, dealer, Box::new(SplitMix64::new(seed)))
}

fn cards(codes: &str) -> Vec<Card> {
    codes.split(' ').map(|code| code.parse().unwrap()).collect()
}

fn card(code: &str) -> Card {
    code.parse().unwrap()
}

#[test]
fn every_card_is_dealt_three_two_three_and_none_is_turned_up() {
    let state = klaverjas(3, 1);
    for seat in 0..4 {
        assert_eq!(state.hand(seat).len(), 8);
    }
    assert_eq!(state.upturned_card(), None);
    let sizes: Vec<usize> = state
        .deal_summary()
        .packets
        .iter()
        .map(|packet| packet.cards)
        .collect();
    assert_eq!(sizes, [3, 3, 3, 3, 2, 2, 2, 2, 3, 3, 3, 3]);
    assert_eq!(state.active_seat(), 0, "the player after the dealer speaks first");
}

#[test]
fn the_first_to_name_a_suit_plays_with_the_hands_as_dealt() {
    let mut state = klaverjas(3, 2);
    let hand = state.hand(1).to_vec();
    state.pass(0).unwrap();
    state.choose_trump(1, Suit::Spades).unwrap();
    let board = state.completed_board().expect("the auction is over");
    assert_eq!(board.variant(), Variant::Klaverjas);
    assert_eq!(board.trump(), Trump::Spades);
    assert_eq!(board.declarer(), 1);
    assert_eq!(board.hand(1), hand, "no card is dealt after the call");
    assert!(!board.announcements(), "roem is found in the tricks, not the hands");
    assert!(board.belotes().is_empty(), "the stuk is roem, not a Belote");
    assert_eq!(state.auction()[1].r#type, CallType::Trump);
}

#[test]
fn the_dealer_must_play_when_the_others_have_passed() {
    let mut state = klaverjas(3, 3);
    for seat in 0..3 {
        state.pass(seat).unwrap();
    }
    assert_eq!(state.pass(3), Err(GameError::DealerMustChooseTrump));
    state.choose_trump(3, Suit::Diamonds).unwrap();
    assert_eq!(state.completed_board().unwrap().declarer(), 3);
}

#[test]
fn a_klaverjas_match_defaults_to_1500_points() {
    assert_eq!(default_target(Variant::Klaverjas), 1_500);
}

/// The fixture deal. Hearts are trumps, North (seat 0) plays and leads, West (seat 3) dealt.
fn fixture() -> GameBoard {
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
    )
}

/// Plays a trick from its leader and returns the board's live scores and the trick's roem.
fn trick(board: &mut GameBoard, plays: &str) -> ((i32, i32), i32) {
    for code in plays.split(' ') {
        let seat = board.active_seat();
        board
            .play(seat, card(code), false)
            .unwrap_or_else(|error| panic!("{code} from seat {seat}: {error}"));
    }
    (board.scores(), board.reviewed_trick_roem())
}

#[test]
fn the_fixture_deal_scores_as_worked_out_by_hand() {
    let mut board = fixture();
    // 1. North's ace of spades wins A K Q J of spades: 20 points and a sequence of four, 50 roem.
    assert_eq!(trick(&mut board, "AS KS QS JS"), ((70, 0), 50));
    assert_eq!(board.next_leader(), 0);
    board.continue_after_trick().unwrap();
    // 2. East's ace of diamonds wins 7 8 9 of diamonds it did not hold: 11 points and 20 roem.
    assert_eq!(trick(&mut board, "7D AD 8D 9D"), ((70, 31), 20));
    assert_eq!(board.next_leader(), 1);
    board.continue_after_trick().unwrap();
    // 3. South trumps East's ten of diamonds. West cannot beat the queen of hearts with the 7 and holds clubs: it may
    // not undertrump. North's partner is winning, so North may give its ten of clubs. 23 points.
    board.play(1, card("10D"), false).unwrap();
    board.play(2, card("QH"), false).unwrap();
    assert!(
        board
            .illegal_cards(3)
            .contains(&(card("7H"), IllegalReason::MayNotUndertrump))
    );
    assert_eq!(board.play(3, card("7H"), false), Err(GameError::IllegalCard));
    board.play(3, card("7C"), false).unwrap();
    assert!(board.illegal_cards(0).is_empty(), "the partner is winning");
    board.play(0, card("10C"), false).unwrap();
    assert_eq!((board.scores(), board.reviewed_trick_roem()), ((93, 31), 0));
    assert_eq!(board.next_leader(), 2);
    board.continue_after_trick().unwrap();
    // 4. A trump lead: West must follow with its 7, North must overtrump the ace (with the 9), East cannot. North's 9 wins
    // 25 points and the 7 8 9 of hearts, 20 roem.
    assert_eq!(
        board.illegal_cards(2),
        Vec::new(),
        "the leader plays anything"
    );
    board.play(2, card("AH"), false).unwrap();
    board.play(3, card("7H"), false).unwrap();
    assert_eq!(
        board.illegal_cards(0),
        vec![
            (card("AS"), IllegalReason::MustFollow(Suit::Hearts)),
            (card("10S"), IllegalReason::MustFollow(Suit::Hearts)),
            (card("9S"), IllegalReason::MustFollow(Suit::Hearts)),
            (card("AC"), IllegalReason::MustFollow(Suit::Hearts)),
        ]
        .into_iter()
        .filter(|(held, _)| board.hand(0).contains(held))
        .collect::<Vec<_>>()
    );
    board.play(0, card("9H"), false).unwrap();
    board.play(1, card("8H"), false).unwrap();
    assert_eq!((board.scores(), board.reviewed_trick_roem()), ((138, 31), 20));
    assert_eq!(board.next_leader(), 0);
    board.continue_after_trick().unwrap();
    // 5. The jack of hearts draws East's ten and South's king; West has no trump and discards. 34 points, no roem
    // (10 J K: the queen is missing).
    assert_eq!(trick(&mut board, "JH 10H KH 8C"), ((172, 31), 0));
    board.continue_after_trick().unwrap();
    // 6. East, out of clubs and trumps, discards. 17 points.
    assert_eq!(trick(&mut board, "AC JD KC 9C"), ((189, 31), 0));
    board.continue_after_trick().unwrap();
    // 7. 13 points; 10 8 7 of spades is no sequence.
    assert_eq!(trick(&mut board, "10S QD 8S 7S"), ((202, 31), 0));
    // 8. The last trick plays itself: 9 points and 10 for the last trick.
    board.continue_after_trick().unwrap();
    assert_eq!(board.scores(), (221, 31));
    let result = board.round_result().expect("the round is over");
    assert_eq!(
        (result.north_south_card_points, result.east_west_card_points),
        (141, 11)
    );
    assert_eq!(
        (result.north_south_dix_de_der, result.east_west_dix_de_der),
        (10, 0)
    );
    assert_eq!(
        (
            result.north_south_announcements,
            result.east_west_announcements
        ),
        (70, 20)
    );
    assert!(result.contract_made, "221 is more than half of 252");
    assert_eq!(result.capot_team, None);
    assert_eq!(
        (result.north_south_awarded, result.east_west_awarded),
        (221, 31)
    );
}

#[test]
fn a_playing_team_that_takes_every_trick_makes_pit() {
    // North holds every trump and East–West hold nothing that can win a trick.
    let mut board = GameBoard::from_klaverjas(
        [
            cards("JH 9H AH 10H KH QH 8H 7H"),
            cards("7S 8S 9S 10S 7C 8C 9C 10C"),
            cards("AS KS QS JS AC KC QC JC"),
            cards("7D 8D 9D 10D JD QD KD AD"),
        ],
        Suit::Hearts,
        0,
        3,
    );
    while board.round_result().is_none() {
        if board.reviewing_completed_trick() {
            board.continue_after_trick().unwrap();
        } else {
            let seat = board.active_seat();
            let card = board.legal_cards(seat)[0];
            board.play(seat, card, false).unwrap();
        }
    }
    let result = board.round_result().unwrap();
    assert_eq!(result.capot_team, Some(Team::NorthSouth));
    let roem = result.north_south_announcements;
    assert_eq!(result.north_south_awarded, 162 + roem + 100);
    assert_eq!(result.east_west_awarded, 0);
}

#[test]
fn the_bots_play_whole_klaverjas_rounds_legally() {
    for difficulty in [Difficulty::Relaxed, Difficulty::Challenging] {
        let strategy = strategies::for_difficulty(difficulty);
        for seed in 0..12 {
            let mut state = klaverjas(seed as usize % 4, seed);
            while state.completed_board().is_none() {
                let seat = state.active_seat();
                let decision = strategy.decide_auction(&state.auction_view(seat));
                match decision {
                    AuctionDecision::Trump { .. } | AuctionDecision::Pass => {
                        state.apply(seat, decision).unwrap();
                    }
                    other => panic!("a Klaverjas bot made a {other:?}"),
                }
            }
            let mut board = state.into_board().unwrap();
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
            let awarded = result.north_south_awarded + result.east_west_awarded;
            let roem = result.north_south_announcements + result.east_west_announcements;
            let pit = if result.capot_team.is_some() { 100 } else { 0 };
            assert_eq!(awarded, 162 + roem + pit, "{difficulty:?} seed {seed}");
        }
    }
}
