//! Card ranking and points under a trump suit, all trumps or no trumps, shared by the rules engine
//! and the bots.

use crate::card::{Card, Rank, Suit, Trump};

/// The card's rank within its suit: a higher value beats a lower one of the same suit.
pub fn strength(card: Card, trump: Trump) -> i32 {
    const TRUMP_ORDER: [Rank; 8] = [
        Rank::Seven,
        Rank::Eight,
        Rank::Queen,
        Rank::King,
        Rank::Ten,
        Rank::Ace,
        Rank::Nine,
        Rank::Jack,
    ];
    const NORMAL_ORDER: [Rank; 8] = [
        Rank::Seven,
        Rank::Eight,
        Rank::Nine,
        Rank::Jack,
        Rank::Queen,
        Rank::King,
        Rank::Ten,
        Rank::Ace,
    ];
    let order = if trump.is_trump(card.suit) {
        TRUMP_ORDER
    } else {
        NORMAL_ORDER
    };
    order
        .iter()
        .position(|&rank| rank == card.rank)
        .map_or(-1, |index| index as i32)
}

pub fn points(card: Card, trump: Trump) -> i32 {
    match trump {
        Trump::AllTrumps => {
            return match card.rank {
                Rank::Jack => 13,
                Rank::Nine => 9,
                Rank::Ace => 6,
                Rank::Ten => 5,
                Rank::King => 3,
                Rank::Queen => 2,
                _ => 0,
            };
        }
        Trump::NoTrumps => {
            return match card.rank {
                Rank::Ace => 19,
                Rank::Ten => 10,
                Rank::King => 4,
                Rank::Queen => 3,
                Rank::Jack => 2,
                _ => 0,
            };
        }
        _ => {}
    }
    let is_trump = trump.is_trump(card.suit);
    match card.rank {
        Rank::Ace => 11,
        Rank::Ten => 10,
        Rank::King => 4,
        Rank::Queen => 3,
        Rank::Jack if is_trump => 20,
        Rank::Jack => 2,
        Rank::Nine if is_trump => 14,
        _ => 0,
    }
}

/// Whether the contender beats the card currently winning a trick led in the given suit.
pub fn beats(contender: Card, winner: Card, lead: Suit, trump: Trump) -> bool {
    if contender.suit == winner.suit {
        return strength(contender, trump) > strength(winner, trump);
    }
    if !trump.suit_contract() {
        return false;
    }
    trump.is_trump(contender.suit) || (!trump.is_trump(winner.suit) && contender.suit == lead)
}

/// The cards of the hand that may be played on the given trick, in hand order. A player must
/// follow the suit led, overtrumping when trumps are led. A player who cannot follow must trump,
/// overtrumping when possible, unless their partner is winning the trick. Under all trumps a player
/// must follow and overtake the winning card; under no trumps a player must follow, and otherwise
/// plays any card.
pub fn legal_cards(hand: &[Card], trick: &[Card], trump: Trump) -> Vec<Card> {
    let Some(first) = trick.first() else {
        return hand.to_vec();
    };
    let lead = first.suit;
    let winner = winning_index(trick, trump);
    let lead_cards: Vec<Card> = hand
        .iter()
        .copied()
        .filter(|card| card.suit == lead)
        .collect();
    if !lead_cards.is_empty() {
        if !trump.is_trump(lead) {
            return lead_cards;
        }
        let higher = higher_trumps(&lead_cards, trick[winner], trump);
        return if higher.is_empty() {
            lead_cards
        } else {
            higher
        };
    }
    let partner_winning = winner + 2 == trick.len();
    if partner_winning || !trump.suit_contract() {
        return hand.to_vec();
    }
    let trumps: Vec<Card> = hand
        .iter()
        .copied()
        .filter(|card| trump.is_trump(card.suit))
        .collect();
    if trumps.is_empty() {
        return hand.to_vec();
    }
    let higher = higher_trumps(&trumps, trick[winner], trump);
    if higher.is_empty() { trumps } else { higher }
}

/// Why a card of the hand cannot be played on the trick.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IllegalReason {
    /// A card of the suit led is held, and this card is of another suit.
    MustFollow(Suit),
    /// The hand cannot follow, the partner is not winning, trumps are held, and this card is not one.
    MustTrump,
    /// A higher trump than the winning card is held, and this card is a lower one (under all trumps,
    /// a lower card of the suit led).
    MustOvertrump,
}

/// Why `card` is not among the `legal_cards` of the hand on the trick, or `None` when it may be
/// played. It classifies the cards `legal_cards` leaves out, so the two cannot disagree.
pub fn illegal_reason(
    hand: &[Card],
    trick: &[Card],
    trump: Trump,
    card: Card,
) -> Option<IllegalReason> {
    if legal_cards(hand, trick, trump).contains(&card) {
        return None;
    }
    // Only a non-empty trick restricts the hand.
    let lead = trick.first()?.suit;
    if hand.iter().any(|held| held.suit == lead) {
        return Some(if card.suit == lead {
            IllegalReason::MustOvertrump
        } else {
            IllegalReason::MustFollow(lead)
        });
    }
    Some(if trump.is_trump(card.suit) {
        IllegalReason::MustOvertrump
    } else {
        IllegalReason::MustTrump
    })
}

fn higher_trumps(trumps: &[Card], winner: Card, trump: Trump) -> Vec<Card> {
    if !trump.is_trump(winner.suit) {
        return trumps.to_vec();
    }
    trumps
        .iter()
        .copied()
        .filter(|&card| strength(card, trump) > strength(winner, trump))
        .collect()
}

/// The position, in play order, of the card winning the given non-empty trick.
pub fn winning_index(trick: &[Card], trump: Trump) -> usize {
    let lead = trick[0].suit;
    let mut winner = 0;
    for index in 1..trick.len() {
        if beats(trick[index], trick[winner], lead, trump) {
            winner = index;
        }
    }
    winner
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::{Rank::*, Suit::*};

    #[test]
    fn rules_legal_cards_follow_overtrump() {
        let hand = [
            Card::new(Seven, Hearts),
            Card::new(Ace, Hearts),
            Card::new(Eight, Clubs),
            Card::new(Nine, Hearts),
        ];
        let trick = [Card::new(King, Hearts)];

        assert_eq!(
            legal_cards(&hand, &trick, Trump::Hearts),
            vec![Card::new(Ace, Hearts), Card::new(Nine, Hearts)]
        );
        // Following a plain suit: only that suit, in hand order.
        let trick = [Card::new(Ace, Clubs)];
        assert_eq!(
            legal_cards(&hand, &trick, Trump::Hearts),
            vec![Card::new(Eight, Clubs)]
        );
        // Empty trick: everything.
        assert_eq!(legal_cards(&hand, &[], Trump::Hearts), hand.to_vec());
    }

    fn hand_of(codes: &str) -> Vec<Card> {
        codes.split(' ').map(|code| code.parse().unwrap()).collect()
    }

    fn reasons(hand: &str, trick: &str, trump: Trump) -> Vec<(Card, Option<IllegalReason>)> {
        let hand = hand_of(hand);
        let trick = if trick.is_empty() {
            vec![]
        } else {
            hand_of(trick)
        };
        hand.iter()
            .map(|&card| (card, illegal_reason(&hand, &trick, trump, card)))
            .collect()
    }

    fn reason_of(found: &[(Card, Option<IllegalReason>)], code: &str) -> Option<IllegalReason> {
        let card: Card = code.parse().unwrap();
        found.iter().find(|(held, _)| *held == card).unwrap().1
    }

    #[test]
    fn illegal_reason_is_none_exactly_for_legal_cards() {
        use crate::rng::{RandomSource, SplitMix64};
        let mut random = SplitMix64::new(2026);
        let mut checked = 0;
        for _ in 0..5000 {
            let mut deck = Card::deck();
            for index in (1..deck.len()).rev() {
                deck.swap(index, random.next_int(index as i32 + 1) as usize);
            }
            let hand_size = 1 + random.next_int(8) as usize;
            let trick_size = random.next_int(4) as usize;
            let hand = deck[..hand_size].to_vec();
            let trick = deck[hand_size..hand_size + trick_size].to_vec();
            let trump = Trump::ALL[random.next_int(6) as usize];
            let legal = legal_cards(&hand, &trick, trump);
            for &card in &hand {
                let reason = illegal_reason(&hand, &trick, trump, card);
                assert_eq!(
                    reason.is_none(),
                    legal.contains(&card),
                    "{card:?} in {hand:?} on {trick:?} with {trump:?}: {reason:?}"
                );
                checked += 1;
            }
        }
        assert!(checked > 5000);
    }

    #[test]
    fn must_follow_names_the_suit_led() {
        let found = reasons("7S 8C", "AS", Trump::Hearts);
        assert_eq!(
            reason_of(&found, "8C"),
            Some(IllegalReason::MustFollow(Spades))
        );
        assert_eq!(reason_of(&found, "7S"), None);
    }

    #[test]
    fn must_follow_applies_under_no_trumps() {
        let found = reasons("7S 8C", "AS", Trump::NoTrumps);
        assert_eq!(
            reason_of(&found, "8C"),
            Some(IllegalReason::MustFollow(Spades))
        );
    }

    #[test]
    fn must_trump_when_unable_to_follow() {
        let found = reasons("8C 7H", "AS", Trump::Hearts);
        assert_eq!(reason_of(&found, "8C"), Some(IllegalReason::MustTrump));
        assert_eq!(reason_of(&found, "7H"), None);
    }

    #[test]
    fn partner_winning_frees_the_hand() {
        let found = reasons("8C 7H", "AS 7D", Trump::Hearts);
        assert_eq!(reason_of(&found, "8C"), None);
        assert_eq!(reason_of(&found, "7H"), None);
    }

    #[test]
    fn must_overtrump_following_a_trump_lead() {
        let found = reasons("7H JH", "KH", Trump::Hearts);
        assert_eq!(reason_of(&found, "7H"), Some(IllegalReason::MustOvertrump));
        assert_eq!(reason_of(&found, "JH"), None);
    }

    #[test]
    fn must_overtrump_when_cutting() {
        let found = reasons("7H JH 8C", "AS KH", Trump::Hearts);
        assert_eq!(reason_of(&found, "7H"), Some(IllegalReason::MustOvertrump));
        assert_eq!(reason_of(&found, "8C"), Some(IllegalReason::MustTrump));
        assert_eq!(reason_of(&found, "JH"), None);
    }

    #[test]
    fn all_trumps_asks_for_a_higher_card_of_the_suit_led() {
        let found = reasons("7S JS 8C", "QS", Trump::AllTrumps);
        assert_eq!(reason_of(&found, "7S"), Some(IllegalReason::MustOvertrump));
        assert_eq!(
            reason_of(&found, "8C"),
            Some(IllegalReason::MustFollow(Spades))
        );
        assert_eq!(reason_of(&found, "JS"), None);
    }
}
