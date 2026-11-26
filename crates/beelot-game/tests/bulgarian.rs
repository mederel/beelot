//! Bulgarian belot (US-215): ranked games, no contract value, the declarer must beat the defence.

use beelot_game::bidding::{BiddingState, CallType};
use beelot_game::bot::rule_based::RuleBasedStrategy;
use beelot_game::bot::turns::{play_turn, take_auction_turn};
use beelot_game::rng::SplitMix64;
use beelot_game::{GameError, Trump, Variant};

fn auction(seed: i64) -> BiddingState {
    BiddingState::new(Variant::Bulgarian, 3, Box::new(SplitMix64::new(seed)))
}

#[test]
fn eight_cards_are_dealt_and_there_is_no_upturned_card() {
    let state = auction(1);
    assert!((0..4).all(|seat| state.hand(seat).len() == 8));
    assert!(state.upturned_card().is_none());
    assert_eq!(state.active_seat(), 0);
}

#[test]
fn a_game_must_outrank_the_last_one() {
    let mut state = auction(2);
    state.bid(0, 3, Trump::Hearts).unwrap();
    assert_eq!(state.bid(1, 2, Trump::Diamonds), Err(GameError::BidTooLow));
    assert_eq!(state.bid(1, 3, Trump::Hearts), Err(GameError::BidTooLow));
    assert_eq!(state.bid(1, 90, Trump::Spades), Err(GameError::InvalidBid));
    state.bid(1, 4, Trump::Spades).unwrap();
    state.bid(2, 5, Trump::NoTrumps).unwrap();
    state.bid(3, 6, Trump::AllTrumps).unwrap();
    assert_eq!(state.bid(0, 6, Trump::AllTrumps), Err(GameError::BidTooLow));
}

#[test]
fn three_passes_after_a_bid_end_the_auction_and_there_is_no_contra() {
    let mut state = auction(3);
    state.bid(0, 4, Trump::Spades).unwrap();
    assert_eq!(state.coinche(1), Err(GameError::ContractOnlyInContree));
    for seat in 1..4 {
        state.pass(seat).unwrap();
    }
    let board = state.completed_board().expect("the auction is over");
    assert_eq!(board.trump(), Trump::Spades);
    assert_eq!(board.declarer(), 0);
}

#[test]
fn four_passes_redeal_and_the_deal_moves_on() {
    let mut state = auction(4);
    for seat in 0..4 {
        state.pass(seat).unwrap();
    }
    assert_eq!(state.deals(), 2);
    assert_eq!(state.dealer(), 0);
    assert_eq!(state.active_seat(), 1);
}

#[test]
fn bots_bid_legally_and_play_whole_rounds() {
    let strategy = RuleBasedStrategy::default();
    let mut bids = 0;
    let mut inside = 0;
    for seed in 0..40 {
        let mut state = auction(seed);
        while state.completed_board().is_none() {
            take_auction_turn(&mut state, &strategy).expect("a legal call");
            if state
                .auction()
                .last()
                .is_some_and(|call| call.r#type == CallType::Bid)
            {
                bids += 1;
            }
            if state.deals() > 10 {
                break;
            }
        }
        let Some(mut board) = state.into_board() else {
            continue;
        };
        let declarer = board.declarer();
        while board.round_result().is_none() {
            if board.reviewing_completed_trick() {
                board.continue_after_trick().unwrap();
                continue;
            }
            play_turn(&mut board, &strategy).expect("a legal card");
        }
        let result = board.round_result().unwrap();
        assert!(result.north_south_awarded + result.east_west_awarded >= 162);
        if !result.contract_made {
            // Inside: the defence scores every point.
            let defence = if declarer % 2 == 0 {
                result.east_west_awarded
            } else {
                result.north_south_awarded
            };
            assert!(defence >= 162, "an inside contract gives the defence 162");
            inside += 1;
        }
    }
    assert!(bids > 0, "the bots bid sometimes");
    assert!(inside > 0, "some contracts go inside");
}

mod fixture {
    use std::fs;
    use std::path::Path;

    use beelot_game::bot::BotStrategy;
    use beelot_game::bot::rule_based::RuleBasedStrategy;

    use super::*;

    const FILE: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/deals-bulgarian.jsonl"
    );

    /// Plays one seeded deal with the rule-based bots and writes it in the fixtures' format.
    /// Run with `cargo test -p beelot-game --test bulgarian -- --ignored record`.
    #[test]
    #[ignore = "records the fixture"]
    fn record() {
        let strategy = RuleBasedStrategy::default();
        let mut lines = Vec::new();
        for seed in [11_i64, 23] {
            let mut state = auction(seed);
            let mut steps = Vec::new();
            while state.completed_board().is_none() {
                let seat = state.active_seat();
                let view = state.auction_view(seat);
                let decision = strategy.decide_auction(&view);
                steps.push(serde_json::json!({"auction": {"seat": seat, "view": view, "decision": decision}}));
                state.apply(seat, decision).unwrap();
            }
            let mut board = state.into_board().unwrap();
            while board.round_result().is_none() {
                if board.reviewing_completed_trick() {
                    board.continue_after_trick().unwrap();
                    steps.push(serde_json::json!({"continue": {}}));
                    continue;
                }
                let seat = board.active_seat();
                let view = board.play_view(seat);
                let card = strategy.choose_card(&view);
                steps.push(serde_json::json!({"play": {"seat": seat, "view": view, "card": card}}));
                board.play(seat, card, true).unwrap();
            }
            lines.push(
                serde_json::json!({
                    "seed": seed, "variant": "BULGARIAN", "announcements": false, "allTrumps": true,
                    "dealer": 3, "northSouth": "current", "eastWest": "challenging",
                    "steps": steps, "result": board.round_result(),
                })
                .to_string(),
            );
        }
        fs::write(FILE, lines.join("\n") + "\n").unwrap();
    }

    /// Every recorded decision is what the bots decide now, and legal.
    #[test]
    fn the_recorded_deals_replay() {
        let text = fs::read_to_string(Path::new(FILE)).expect("fixtures/deals-bulgarian.jsonl");
        let strategy = RuleBasedStrategy::default();
        let mut decisions = 0;
        for line in text.lines() {
            let deal: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(deal["variant"], "BULGARIAN");
            for step in deal["steps"].as_array().unwrap() {
                if let Some(auction) = step.get("auction") {
                    let view = serde_json::from_value(auction["view"].clone()).unwrap();
                    let decision = serde_json::from_value(auction["decision"].clone()).unwrap();
                    assert_eq!(strategy.decide_auction(&view), decision);
                    decisions += 1;
                } else if let Some(play) = step.get("play") {
                    let view: beelot_game::board::PlayView =
                        serde_json::from_value(play["view"].clone()).unwrap();
                    let card: beelot_game::Card =
                        serde_json::from_value(play["card"].clone()).unwrap();
                    assert!(view.legal_cards.contains(&card));
                    assert_eq!(strategy.choose_card(&view), card);
                    decisions += 1;
                }
            }
        }
        assert!(decisions > 40);
    }
}
