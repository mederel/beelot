//! Bazar Blot (US-216): the bazar of numbered bids, contra and recontra, the kaput bid, and the score in tens ("sai").

use beelot_game::bidding::{AuctionDecision, BiddingState, CallType};
use beelot_game::bot::rule_based::RuleBasedStrategy;
use beelot_game::bot::turns::{play_turn, take_auction_turn};
use beelot_game::match_score::{MatchScore, default_target, targets};
use beelot_game::rng::SplitMix64;
use beelot_game::scoring::{Totals, sai, score};
use beelot_game::{GameError, Team, Trump, Variant};

fn auction(seed: i64) -> BiddingState {
    BiddingState::new(Variant::BazarBlot, 3, Box::new(SplitMix64::new(seed)))
        .with_announcements(true)
}

#[test]
fn eight_cards_are_dealt_in_three_packets_and_none_is_turned_up() {
    let state = auction(1);
    assert!((0..4).all(|seat| state.hand(seat).len() == 8));
    assert!(state.upturned_card().is_none());
    let sizes: Vec<usize> = state
        .deal_summary()
        .packets
        .iter()
        .map(|packet| packet.cards)
        .collect();
    assert_eq!(sizes, [3, 3, 3, 3, 2, 2, 2, 2, 3, 3, 3, 3]);
    assert_eq!(state.active_seat(), 0);
}

#[test]
fn a_bid_is_a_number_from_8_to_24_or_kaput_and_must_be_higher() {
    let mut state = auction(2);
    assert_eq!(state.bid(0, 7, Trump::Hearts), Err(GameError::InvalidBid));
    assert_eq!(state.bid(0, 80, Trump::Hearts), Err(GameError::InvalidBid));
    assert_eq!(state.bid(0, 26, Trump::Hearts), Err(GameError::InvalidBid));
    assert_eq!(
        state.bid(0, 8, Trump::AllTrumps),
        Err(GameError::InvalidBid)
    );
    state.bid(0, 8, Trump::Hearts).unwrap();
    // A higher number is needed, whatever the suit: no trumps at 8 does not overcall.
    assert_eq!(state.bid(1, 8, Trump::NoTrumps), Err(GameError::BidTooLow));
    state.bid(1, 9, Trump::NoTrumps).unwrap();
    // A player may raise their partner.
    state.bid(2, 10, Trump::Hearts).unwrap();
    state.bid(3, 25, Trump::Spades).unwrap();
    assert_eq!(state.bid(0, 25, Trump::Hearts), Err(GameError::BidTooLow));
    state.pass(0).unwrap();
    state.pass(1).unwrap();
    state.pass(2).unwrap();
    let board = state.completed_board().expect("three passes end the bazar");
    assert_eq!(board.contract_value(), 25);
    assert_eq!(board.trump(), Trump::Spades);
    assert_eq!(board.declarer(), 3);
}

#[test]
fn a_player_who_passed_may_bid_later() {
    let mut state = auction(3);
    state.pass(0).unwrap();
    state.bid(1, 8, Trump::Clubs).unwrap();
    state.pass(2).unwrap();
    state.pass(3).unwrap();
    state.bid(0, 9, Trump::Diamonds).unwrap();
    assert!(state.completed_board().is_none());
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
fn contra_stops_the_bidding_and_the_bidding_team_may_answer_recontra() {
    let mut state = auction(5);
    state.bid(0, 10, Trump::Hearts).unwrap();
    assert!(state.can_coinche(1));
    state.coinche(1).unwrap();
    assert!(state.completed_board().is_none());
    assert_eq!(state.active_seat(), 2);
    assert!(state.can_recontra(2));
    assert_eq!(
        state.bid(2, 11, Trump::Hearts),
        Err(GameError::BiddingClosed)
    );
    assert_eq!(state.coinche(2), Err(GameError::CoincheNotAllowed));
    state.recontra(2).unwrap();
    let board = state.completed_board().expect("recontra ends the bazar");
    assert!(board.coinched());
    assert!(board.recontra());
    assert_eq!(
        state.auction().last().map(|call| call.r#type),
        Some(CallType::Recontra)
    );
}

#[test]
fn after_contra_both_players_of_the_bidding_team_may_pass() {
    let mut state = auction(6);
    state.pass(0).unwrap();
    state.bid(1, 12, Trump::NoTrumps).unwrap();
    state.coinche(2).unwrap();
    assert_eq!(state.active_seat(), 3);
    assert!(state.can_recontra(3));
    state.pass(3).unwrap();
    // The defender after them is skipped: the bidder answers last.
    assert_eq!(state.active_seat(), 1);
    assert_eq!(state.recontra(0), Err(GameError::NotYourTurn));
    state.pass(1).unwrap();
    let board = state.completed_board().expect("two passes end the bazar");
    assert!(board.coinched());
    assert!(!board.recontra());
}

#[test]
fn only_an_opponent_may_say_contra_and_only_the_bidding_team_recontra() {
    let mut state = auction(7);
    assert_eq!(state.coinche(0), Err(GameError::CoincheNotAllowed));
    state.bid(0, 8, Trump::Clubs).unwrap();
    state.pass(1).unwrap();
    assert_eq!(state.coinche(2), Err(GameError::CoincheNotAllowed));
    assert_eq!(state.recontra(2), Err(GameError::RecontraNotAllowed));
    state.apply(2, AuctionDecision::Pass).unwrap();
    state.apply(3, AuctionDecision::Coinche).unwrap();
    assert_eq!(state.active_seat(), 0);
    state.apply(0, AuctionDecision::Recontra).unwrap();
    assert!(state.completed_board().is_some());
}

#[test]
fn recontra_is_only_for_bazar_blot() {
    let mut state = BiddingState::new(Variant::Contree, 3, Box::new(SplitMix64::new(8)));
    state.bid(0, 80, Trump::Hearts).unwrap();
    state.coinche(1).unwrap();
    assert!(state.completed_board().is_some());
    assert_eq!(state.recontra(2), Err(GameError::AuctionEnded));
}

#[test]
fn sai_rounds_a_half_down() {
    assert_eq!(sai(112), 11);
    assert_eq!(sai(115), 11);
    assert_eq!(sai(116), 12);
    assert_eq!(sai(0), 0);
    assert_eq!(sai(162), 16);
}

/// North–South bid `bid` in hearts; `ns` is their card points and last trick together.
fn totals(bid: i32, trump: Trump, ns_cards: i32, ns_tricks: i32) -> Totals {
    let ns_dix = if ns_tricks > 0 { 10 } else { 0 };
    Totals {
        variant: Variant::BazarBlot,
        north_south_declares: true,
        contract_value: bid,
        coinched: false,
        recontra: false,
        no_trumps: trump == Trump::NoTrumps,
        north_south_card_points: ns_cards,
        east_west_card_points: 152 - ns_cards,
        north_south_dix_de_der: ns_dix,
        east_west_dix_de_der: 10 - ns_dix,
        north_south_belote: 0,
        east_west_belote: 0,
        north_south_tricks: ns_tricks,
        north_south_announcements: 0,
        east_west_announcements: 0,
    }
}

#[test]
fn a_made_bid_scores_the_bid_and_the_deal_less_the_defence() {
    // 106 + 10 = 116 for North–South, 46 for East–West: sai 5.
    let result = score(&totals(10, Trump::Hearts, 106, 5), &[]);
    assert!(result.contract_made);
    assert_eq!(result.north_south_awarded, 10 + 16 - 5);
    assert_eq!(result.east_west_awarded, 5);
    assert_eq!(result.north_south_bid, 10);
}

#[test]
fn a_bid_is_made_with_exactly_bid_times_ten() {
    let result = score(&totals(10, Trump::Hearts, 90, 4), &[]);
    assert!(result.contract_made, "100 makes a bid of 10");
    let result = score(&totals(10, Trump::Hearts, 89, 4), &[]);
    assert!(!result.contract_made, "99 fails a bid of 10");
}

#[test]
fn a_failed_bid_gives_the_defence_the_bid_and_the_deal_and_every_declaration() {
    let mut t = totals(12, Trump::Hearts, 90, 4);
    t.north_south_belote = 20;
    t.east_west_announcements = 50;
    let result = score(&t, &[]);
    // The blot counts for the bid: 90 + 10 + 20 = 120.
    assert!(result.contract_made);
    t.north_south_belote = 0;
    let result = score(&t, &[]);
    assert!(!result.contract_made);
    assert_eq!(result.north_south_awarded, 0);
    assert_eq!(result.east_west_awarded, 12 + 16 + 5);
    assert_eq!(result.east_west_bid, 12);
    assert_eq!(result.north_south_bid, 0);
}

#[test]
fn the_blot_stays_with_its_team_when_the_bid_fails() {
    let mut t = totals(15, Trump::Hearts, 90, 4);
    t.north_south_belote = 20;
    let result = score(&t, &[]);
    assert!(!result.contract_made);
    assert_eq!(result.north_south_awarded, 2);
    assert_eq!(result.east_west_awarded, 15 + 16);
}

#[test]
fn no_trumps_counts_the_bid_twice_contra_and_recontra_more() {
    let made = totals(9, Trump::NoTrumps, 106, 5);
    assert_eq!(score(&made, &[]).north_south_awarded, 18 + 16 - 5);
    let mut contra = made.clone();
    contra.coinched = true;
    let result = score(&contra, &[]);
    assert_eq!(result.north_south_awarded, 27 + 16);
    assert_eq!(result.east_west_awarded, 0);
    let mut recontra = contra.clone();
    recontra.recontra = true;
    assert_eq!(score(&recontra, &[]).north_south_awarded, 45 + 16);
    let mut suit = totals(9, Trump::Spades, 106, 5);
    suit.coinched = true;
    suit.recontra = true;
    assert_eq!(score(&suit, &[]).north_south_awarded, 36 + 16);
}

#[test]
fn a_contra_on_a_failed_bid_pays_the_defence() {
    let mut t = totals(11, Trump::Clubs, 70, 3);
    t.coinched = true;
    t.north_south_announcements = 20;
    let result = score(&t, &[]);
    assert!(!result.contract_made);
    assert_eq!(result.east_west_awarded, 22 + 16 + 2);
}

#[test]
fn a_kaput_scores_25_for_the_deal() {
    let result = score(&totals(16, Trump::Hearts, 152, 8), &[]);
    assert!(result.contract_made, "every trick counts 252");
    assert_eq!(result.capot_team, Some(Team::NorthSouth));
    assert_eq!(result.north_south_awarded, 16 + 25);
    assert_eq!(result.east_west_awarded, 0);
}

#[test]
fn a_kaput_bid_needs_every_trick() {
    let result = score(&totals(25, Trump::Hearts, 150, 7), &[]);
    assert!(!result.contract_made);
    assert_eq!(result.east_west_awarded, 25 + 16);
    let result = score(&totals(25, Trump::Hearts, 152, 8), &[]);
    assert!(result.contract_made);
    assert_eq!(result.north_south_awarded, 25 + 25);
}

#[test]
fn a_defence_taking_every_trick_scores_25_for_the_deal() {
    let result = score(&totals(8, Trump::Hearts, 0, 0), &[]);
    assert!(!result.contract_made);
    assert_eq!(result.capot_team, Some(Team::EastWest));
    assert_eq!(result.east_west_awarded, 8 + 25);
}

#[test]
fn the_match_is_played_in_tens_to_301_by_default() {
    assert_eq!(default_target(Variant::BazarBlot), 301);
    assert_eq!(targets(Variant::BazarBlot), [101, 151, 201, 301]);
    assert!(targets(Variant::Classic).contains(&1_000));
    assert!(MatchScore::to(151).is_some());
    assert_eq!(MatchScore::for_variant(Variant::BazarBlot).target(), 301);
}

#[test]
fn bots_bid_legally_and_play_whole_rounds() {
    let strategy = RuleBasedStrategy::default();
    let mut bids = 0;
    let mut failed = 0;
    for seed in 0..60 {
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
        assert!((8..=24).contains(&board.contract_value()));
        while board.round_result().is_none() {
            if board.reviewing_completed_trick() {
                board.continue_after_trick().unwrap();
                continue;
            }
            play_turn(&mut board, &strategy).expect("a legal card");
        }
        let result = board.round_result().unwrap();
        let total = result.north_south_awarded + result.east_west_awarded;
        assert!(total >= 24, "a deal pays the bid and 16: {result:?}");
        failed += u32::from(!result.contract_made);
    }
    assert!(bids > 0, "the bots bid sometimes");
    assert!(failed > 0, "some bids fail");
}

mod declarations {
    use beelot_game::announcements::{AnnouncementKind, Declared, best_seat_for, find_for};
    use beelot_game::{Card, Trump, Variant};

    fn cards(codes: &str) -> Vec<Card> {
        codes
            .split_whitespace()
            .map(|code| code.parse().unwrap())
            .collect()
    }

    fn carre_value(hand: &str, trump: Trump) -> Option<i32> {
        find_for(Variant::BazarBlot, &cards(hand), trump)
            .into_iter()
            .find(|announcement| announcement.kind == AnnouncementKind::Carre)
            .map(|announcement| announcement.value)
    }

    #[test]
    fn four_of_a_kind_have_the_armenian_values() {
        assert_eq!(carre_value("JC JD JH JS", Trump::Hearts), Some(200));
        assert_eq!(carre_value("9C 9D 9H 9S", Trump::Hearts), Some(140));
        assert_eq!(carre_value("AC AD AH AS", Trump::Hearts), Some(110));
        assert_eq!(carre_value("KC KD KH KS", Trump::Hearts), Some(100));
        assert_eq!(carre_value("AC AD AH AS", Trump::NoTrumps), Some(190));
        assert_eq!(carre_value("JC JD JH JS", Trump::NoTrumps), Some(100));
        assert_eq!(carre_value("9C 9D 9H 9S", Trump::NoTrumps), None);
        assert_eq!(carre_value("8C 8D 8H 8S", Trump::Hearts), None);
    }

    #[test]
    fn sequences_score_20_50_and_100() {
        let values: Vec<i32> = find_for(Variant::BazarBlot, &cards("7H 8H 9H"), Trump::Spades)
            .iter()
            .map(|announcement| announcement.value)
            .collect();
        assert_eq!(values, [20]);
        let found = find_for(
            Variant::BazarBlot,
            &cards("7S 8S 9S 10S JS QS"),
            Trump::Hearts,
        );
        assert_eq!(found[0].value, 100);
    }

    #[test]
    fn four_of_a_kind_beat_a_sequence_of_the_same_value() {
        // Four kings (100) against a five-card sequence (100): the four of a kind wins, though declared second.
        let declared = [
            Declared {
                seat: 0,
                announcements: find_for(
                    Variant::BazarBlot,
                    &cards("7C 8C 9C 10C JC"),
                    Trump::Hearts,
                ),
            },
            Declared {
                seat: 1,
                announcements: find_for(Variant::BazarBlot, &cards("KC KD KH KS"), Trump::Hearts),
            },
        ];
        assert_eq!(
            best_seat_for(Variant::BazarBlot, &declared, Trump::Hearts),
            Some(1)
        );
    }

    #[test]
    fn four_tens_beat_four_kings_in_a_suit_contract() {
        let declared = [
            Declared {
                seat: 0,
                announcements: find_for(Variant::BazarBlot, &cards("KC KD KH KS"), Trump::Hearts),
            },
            Declared {
                seat: 1,
                announcements: find_for(
                    Variant::BazarBlot,
                    &cards("10C 10D 10H 10S"),
                    Trump::Hearts,
                ),
            },
        ];
        assert_eq!(
            best_seat_for(Variant::BazarBlot, &declared, Trump::Hearts),
            Some(1)
        );
    }
}

mod fixture {
    use std::fs;
    use std::path::Path;

    use beelot_game::bot::BotStrategy;
    use beelot_game::bot::rule_based::RuleBasedStrategy;

    use super::*;

    const FILE: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/deals-bazar-blot.jsonl"
    );

    /// Plays seeded deals with the rule-based bots and writes them in the fixtures' format.
    /// Run with `cargo test -p beelot-game --test bazar_blot -- --ignored record`.
    #[test]
    #[ignore = "records the fixture"]
    fn record() {
        let strategy = RuleBasedStrategy::default();
        let mut lines = Vec::new();
        for seed in [11_i64, 23, 37] {
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
                    "seed": seed, "variant": "BAZAR_BLOT", "announcements": true, "allTrumps": false,
                    "dealer": 3, "northSouth": "current", "eastWest": "current",
                    "steps": steps, "result": board.round_result(),
                })
                .to_string(),
            );
        }
        fs::write(FILE, lines.join("\n") + "\n").unwrap();
    }

    /// Every recorded decision is what the bots decide now, and legal; the deal replays to the recorded result.
    #[test]
    fn the_recorded_deals_replay() {
        let text = fs::read_to_string(Path::new(FILE)).expect("fixtures/deals-bazar-blot.jsonl");
        let strategy = RuleBasedStrategy::default();
        let mut decisions = 0;
        for line in text.lines() {
            let deal: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(deal["variant"], "BAZAR_BLOT");
            let mut state = auction(deal["seed"].as_i64().unwrap());
            let mut board = None;
            for step in deal["steps"].as_array().unwrap() {
                if let Some(auction) = step.get("auction") {
                    let view = serde_json::from_value(auction["view"].clone()).unwrap();
                    let decision = serde_json::from_value(auction["decision"].clone()).unwrap();
                    assert_eq!(strategy.decide_auction(&view), decision);
                    let seat = auction["seat"].as_u64().unwrap() as usize;
                    state.apply(seat, decision).unwrap();
                    decisions += 1;
                } else if let Some(play) = step.get("play") {
                    let board = board.get_or_insert_with(|| {
                        state.completed_board().expect("the bazar is over").clone()
                    });
                    let view: beelot_game::board::PlayView =
                        serde_json::from_value(play["view"].clone()).unwrap();
                    let card: beelot_game::Card =
                        serde_json::from_value(play["card"].clone()).unwrap();
                    assert!(view.legal_cards.contains(&card));
                    assert_eq!(strategy.choose_card(&view), card);
                    let seat = play["seat"].as_u64().unwrap() as usize;
                    board.play(seat, card, true).unwrap();
                    decisions += 1;
                } else if let Some(board) = board.as_mut() {
                    board.continue_after_trick().unwrap();
                }
            }
            let result = serde_json::to_value(board.unwrap().round_result()).unwrap();
            assert_eq!(result, deal["result"]);
        }
        assert!(decisions > 60);
    }
}
