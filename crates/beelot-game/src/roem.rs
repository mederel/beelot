//! Klaverjas roem (US-213): the bonus combinations found among the four cards of a trick, scored
//! by the team that wins it. Three cards in sequence of one suit are 20, four are 50, in the order
//! A K Q J 10 9 8 7 whatever the trump; four aces, tens, kings or queens are 100 and four jacks
//! 200 (four nines, eights or sevens score nothing); the king and queen of trumps, the "stuk", are
//! 20 more, also inside a sequence.

use serde::{Deserialize, Serialize};

use crate::card::{Card, Rank, Suit, Trump};

/// The order of a sequence, from the lowest card.
const SEQUENCE_ORDER: [Rank; 8] = [
    Rank::Seven,
    Rank::Eight,
    Rank::Nine,
    Rank::Ten,
    Rank::Jack,
    Rank::Queen,
    Rank::King,
    Rank::Ace,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RoemKind {
    /// Three cards in sequence: 20.
    Sequence3,
    /// Four cards in sequence: 50.
    Sequence4,
    /// Four cards of one rank: 100, or 200 for jacks.
    FourOfAKind,
    /// The king and queen of trumps: 20.
    Stuk,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Roem {
    pub kind: RoemKind,
    pub points: i32,
}

/// The roem among the cards of a trick, each combination once.
pub fn of_trick(cards: &[Card], trump: Trump) -> Vec<Roem> {
    let mut found = Vec::new();
    if let Some(rank) = four_of_a_kind(cards) {
        let points = match rank {
            Rank::Jack => 200,
            Rank::Ace | Rank::Ten | Rank::King | Rank::Queen => 100,
            _ => 0,
        };
        if points > 0 {
            found.push(Roem {
                kind: RoemKind::FourOfAKind,
                points,
            });
        }
    }
    for suit in Suit::ALL {
        match longest_sequence(cards, suit) {
            3 => found.push(Roem {
                kind: RoemKind::Sequence3,
                points: 20,
            }),
            4.. => found.push(Roem {
                kind: RoemKind::Sequence4,
                points: 50,
            }),
            _ => {}
        }
    }
    if let Some(suit) = trump.suit()
        && cards.contains(&Card::new(Rank::King, suit))
        && cards.contains(&Card::new(Rank::Queen, suit))
    {
        found.push(Roem {
            kind: RoemKind::Stuk,
            points: 20,
        });
    }
    found
}

/// The points of the roem among the cards of a trick.
pub fn points(cards: &[Card], trump: Trump) -> i32 {
    of_trick(cards, trump).iter().map(|roem| roem.points).sum()
}

fn four_of_a_kind(cards: &[Card]) -> Option<Rank> {
    let first = cards.first()?.rank;
    (cards.len() == 4 && cards.iter().all(|card| card.rank == first)).then_some(first)
}

/// The length of the longest run of consecutive ranks of the suit among the cards.
fn longest_sequence(cards: &[Card], suit: Suit) -> usize {
    let mut longest = 0;
    let mut run = 0;
    for rank in SEQUENCE_ORDER {
        if cards.contains(&Card::new(rank, suit)) {
            run += 1;
            longest = longest.max(run);
        } else {
            run = 0;
        }
    }
    longest
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cards(codes: &str) -> Vec<Card> {
        codes.split(' ').map(|code| code.parse().unwrap()).collect()
    }

    fn kinds(codes: &str, trump: Trump) -> Vec<(RoemKind, i32)> {
        of_trick(&cards(codes), trump)
            .into_iter()
            .map(|roem| (roem.kind, roem.points))
            .collect()
    }

    #[test]
    fn three_in_sequence_are_twenty_in_the_natural_order() {
        // 9 10 J of spades: a sequence, though the jack is ranked high in trumps.
        assert_eq!(
            kinds("9S JS 10S 7D", Trump::Spades),
            [(RoemKind::Sequence3, 20)]
        );
        // Q K A of a plain suit.
        assert_eq!(
            kinds("AC 8D QC KC", Trump::Spades),
            [(RoemKind::Sequence3, 20)]
        );
    }

    #[test]
    fn four_in_sequence_are_fifty() {
        assert_eq!(
            kinds("7H 8H 9H 10H", Trump::Spades),
            [(RoemKind::Sequence4, 50)]
        );
    }

    #[test]
    fn a_gap_breaks_the_sequence() {
        assert!(kinds("7H 8H 10H JH", Trump::Spades).is_empty());
    }

    #[test]
    fn four_of_a_kind_are_a_hundred_and_jacks_two_hundred() {
        assert_eq!(
            kinds("AS AH AD AC", Trump::Spades),
            [(RoemKind::FourOfAKind, 100)]
        );
        assert_eq!(
            kinds("QS QH QD QC", Trump::Spades),
            [(RoemKind::FourOfAKind, 100)]
        );
        assert_eq!(
            kinds("JS JH JD JC", Trump::Spades),
            [(RoemKind::FourOfAKind, 200)]
        );
        assert!(kinds("9S 9H 9D 9C", Trump::Spades).is_empty());
        assert!(kinds("7S 7H 7D 7C", Trump::Spades).is_empty());
    }

    #[test]
    fn the_stuk_is_the_king_and_queen_of_trumps() {
        assert_eq!(kinds("KH QH 7S 8D", Trump::Hearts), [(RoemKind::Stuk, 20)]);
        assert!(kinds("KH QH 7S 8D", Trump::Spades).is_empty());
    }

    #[test]
    fn a_stuk_inside_a_sequence_scores_both() {
        assert_eq!(
            kinds("KH QH JH 8D", Trump::Hearts),
            [(RoemKind::Sequence3, 20), (RoemKind::Stuk, 20)]
        );
        assert_eq!(points(&cards("KH QH JH AH"), Trump::Hearts), 70);
    }
}
