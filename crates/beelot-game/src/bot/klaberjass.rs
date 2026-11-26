//! The bot of the two-player game (US-219): a short heuristic. It takes a suit when its six cards are worth enough trump
//! points, wins a trick with its cheapest winning card, and otherwise gives up its cheapest card. The four-seat bots'
//! memory, sampling and solver stay out of it: they count four hands.

use crate::bidding::{AuctionDecision, AuctionView};
use crate::board::PlayView;
use crate::card::{Card, Rank, Suit, Trump};
use crate::rules;

/// What a hand is worth with `suit` as trump: the points of its trumps, a bonus for length, and the side aces.
fn worth(hand: &[Card], suit: Suit) -> i32 {
    let trump = Trump::from(suit);
    let trumps: Vec<&Card> = hand.iter().filter(|card| card.suit == suit).collect();
    let points: i32 = trumps
        .iter()
        .map(|card| rules::points(**card, trump) + rules::strength(**card, trump))
        .sum();
    let length = i32::try_from(trumps.len()).unwrap_or(0);
    let aces = hand
        .iter()
        .filter(|card| card.suit != suit && card.rank == Rank::Ace)
        .count();
    points + 8 * (length - 2).max(0) + 4 * i32::try_from(aces).unwrap_or(0)
}

const TAKE_AT: i32 = 52;

pub fn decide_auction(view: &AuctionView) -> AuctionDecision {
    let upturned = view.upturned_card.map(|card| card.suit);
    let best = Suit::ALL
        .into_iter()
        .filter(|&suit| {
            if view.round == 1 {
                Some(suit) == upturned
            } else {
                Some(suit) != upturned
            }
        })
        .map(|suit| (worth(&view.hand, suit), suit))
        .max_by_key(|(value, _)| *value);
    match best {
        Some((value, suit)) if value >= TAKE_AT => AuctionDecision::Trump { suit },
        _ => AuctionDecision::Pass,
    }
}

pub fn choose_card(view: &PlayView) -> Card {
    let trump = view.trump;
    let legal = &view.legal_cards;
    let cheapest = |cards: &[Card]| -> Card {
        *cards
            .iter()
            .min_by_key(|card| (rules::points(**card, trump), rules::strength(**card, trump)))
            .expect("a legal card")
    };
    let Some(led) = view.current_trick.first() else {
        let strong: Vec<Card> = legal
            .iter()
            .copied()
            .filter(|card| {
                (trump.is_trump(card.suit) && matches!(card.rank, Rank::Jack | Rank::Nine))
                    || (!trump.is_trump(card.suit) && card.rank == Rank::Ace)
            })
            .collect();
        return strong
            .iter()
            .copied()
            .max_by_key(|card| rules::points(*card, trump))
            .unwrap_or_else(|| cheapest(legal));
    };
    let winning = |card: &Card| rules::beats(*card, led.card, led.card.suit, trump);
    let winners: Vec<Card> = legal.iter().copied().filter(winning).collect();
    winners
        .iter()
        .copied()
        .min_by_key(|card| (rules::strength(*card, trump), rules::points(*card, trump)))
        .unwrap_or_else(|| cheapest(legal))
}
