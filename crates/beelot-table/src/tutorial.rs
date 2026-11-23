//! The tutorial's lessons (US-199): a fixed deal, a script of every card played and the plays the coach explains.
//! A lesson starts in the play, with the player (seat 0) on the declaring team. Its explanations are derived from the
//! cards by `beelot_game::bot::hints::explain_card`, so a lesson holds no text.

use std::sync::OnceLock;

use beelot_game::bidding::BiddingState;
use beelot_game::bidding::{AuctionDecision, AuctionView};
use beelot_game::board::PlayView;
use beelot_game::bot::BotStrategy;
use beelot_game::bot::hints::CardReason;
use beelot_game::bot::strategies;
use beelot_game::{Card, Difficulty, SplitMix64, Suit};
use serde::{Deserialize, Serialize};

/// What a tutorial table plays: one of the lessons, or the free game that follows them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Tutorial {
    Lesson { id: String },
    Free,
}

/// A lesson. Seats are numbered in play order; the player is seat 0 and seat 2 is the partner. `hands` lists the four
/// hands of eight cards by seat, `script` every card played in order (from the seat after the dealer), and `coached`
/// the indexes of `script` that are the player's plays to coach.
#[derive(Debug)]
pub struct Lesson {
    pub id: &'static str,
    pub dealer: usize,
    pub trump: Suit,
    pub hands: [&'static str; 4],
    pub script: &'static str,
    pub coached: &'static [usize],
    /// The reason the first coached card must give: what the lesson teaches.
    pub teaches: CardReason,
}

fn cards(codes: &str) -> Vec<Card> {
    codes
        .split_whitespace()
        .map(|code| code.parse().expect("a lesson's card code"))
        .collect()
}

impl Lesson {
    pub fn hands(&self) -> [Vec<Card>; 4] {
        self.hands.map(cards)
    }

    pub fn script(&self) -> Vec<Card> {
        cards(self.script)
    }

    /// The round at its first card.
    pub fn bidding(&self) -> BiddingState {
        BiddingState::preset(
            self.dealer,
            self.hands(),
            self.trump,
            0,
            Box::new(SplitMix64::new(0)),
        )
    }

    /// Whether the play at `index` of the script is one the coach explains.
    pub fn coaches(&self, index: usize) -> bool {
        self.coached.contains(&index)
    }

    /// The bots of this lesson: they play its script.
    pub fn bot(&self) -> &'static ScriptedBot {
        let position = LESSONS
            .iter()
            .position(|lesson| lesson.id == self.id)
            .expect("a listed lesson");
        &bots()[position]
    }
}

/// Plays a lesson's script: the card whose turn it is in the play order, then, once the script has ended, what a
/// Relaxed bot would play.
#[derive(Debug)]
pub struct ScriptedBot {
    script: Vec<Card>,
}

impl BotStrategy for ScriptedBot {
    fn decide_auction(&self, view: &AuctionView) -> AuctionDecision {
        strategies::for_difficulty(Difficulty::Relaxed).decide_auction(view)
    }

    fn choose_card(&self, view: &PlayView) -> Card {
        let index = view.tricks.len() * 4 + view.current_trick.len();
        match self.script.get(index) {
            Some(card) if view.legal_cards.contains(card) => *card,
            _ => strategies::for_difficulty(Difficulty::Relaxed).choose_card(view),
        }
    }
}

fn bots() -> &'static [ScriptedBot] {
    static BOTS: OnceLock<Vec<ScriptedBot>> = OnceLock::new();
    BOTS.get_or_init(|| {
        LESSONS
            .iter()
            .map(|lesson| ScriptedBot {
                script: lesson.script(),
            })
            .collect()
    })
}

pub fn lessons() -> &'static [Lesson] {
    &LESSONS
}

pub fn lesson(id: &str) -> Option<&'static Lesson> {
    LESSONS.iter().find(|lesson| lesson.id == id)
}

static LESSONS: [Lesson; 6] = [
    Lesson {
        id: "lead-trump",
        dealer: 3,
        trump: Suit::Hearts,
        hands: [
            "JH 9H 7C 8C KD 7D 8S 9S",
            "8H 10H QC KC 8D 9D 7S 10S",
            "AH 7H JC 9C AD QD JS QS",
            "QH KH AC 10C JD 10D KS AS",
        ],
        script: "JH 8H 7H QH 9H 10H AH KH",
        coached: &[0, 4],
        teaches: CardReason::LeadTrumps,
    },
    Lesson {
        id: "win-cheaply",
        dealer: 0,
        trump: Suit::Clubs,
        hands: [
            "JD AD 7H 8H 7S 8S 7C 8C",
            "9D QD 9H JH 9S JS 9C JC",
            "8D KD 10H QH 10S QS 10C QC",
            "7D 10D KH AH KS AS KC AC",
        ],
        script: "9D 8D 7D JD AD QD KD 10D",
        coached: &[3, 4],
        teaches: CardReason::WinCheaply,
    },
    Lesson {
        id: "follow-suit",
        dealer: 0,
        trump: Suit::Hearts,
        hands: [
            "QS JH 9H 7C 8C KD 7D 8D",
            "AS 10S KS 7H AH KC AC AD",
            "7S 9S 8H 10H 9C 10C 9D 10D",
            "8S JS QH KH JC QC JD QD",
        ],
        script: "AS 7S 8S QS",
        coached: &[3],
        teaches: CardReason::OnlyLegalCard,
    },
    Lesson {
        id: "cut",
        dealer: 0,
        trump: Suit::Hearts,
        hands: [
            "7H 9H JH 8S 9S 7D 8D KD",
            "AC 10C KC 8H 10H 7S 10S 9D",
            "7C 9C JC QH KH JS QS QD",
            "8C QC AH KS AS 10D AD JD",
        ],
        script: "AC 7C 8C 7H",
        coached: &[3],
        teaches: CardReason::WinCheaply,
    },
    Lesson {
        id: "partners-trick",
        dealer: 1,
        trump: Suit::Spades,
        hands: [
            "AD 7D 7H 8H 7C 8C 7S 8S",
            "9D QD KH AH KC AC KS AS",
            "KD 10D 9H JH 9C JC 9S JS",
            "8D JD 10H QH 10C QC 10S QS",
        ],
        script: "KD 8D 7D 9D",
        coached: &[2],
        teaches: CardReason::KeepPartnersTrick,
    },
    Lesson {
        id: "give-points",
        dealer: 1,
        trump: Suit::Spades,
        hands: [
            "10H 8H 7D 8D 7C 8C 7S 8S",
            "9H JH KD AD KC AC KS AS",
            "AH KH 9D JD 9C JC 9S JS",
            "7H QH 10D QD 10C QC 10S QS",
        ],
        script: "AH 7H 10H 9H",
        coached: &[2],
        teaches: CardReason::GivePoints,
    },
];

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use beelot_game::bot::hints::explain_card;

    use super::*;

    #[test]
    fn lesson_ids_are_unique_and_found() {
        let ids: HashSet<&str> = lessons().iter().map(|lesson| lesson.id).collect();
        assert_eq!(ids.len(), lessons().len());
        for lesson_ in lessons() {
            assert_eq!(lesson(lesson_.id).map(|found| found.id), Some(lesson_.id));
        }
        assert!(lesson("nope").is_none());
    }

    #[test]
    fn every_lesson_deals_the_whole_deck_once() {
        for lesson in lessons() {
            let all: Vec<Card> = lesson.hands().into_iter().flatten().collect();
            assert_eq!(all.len(), 32, "{}", lesson.id);
            let distinct: HashSet<Card> = all.iter().copied().collect();
            assert_eq!(distinct.len(), 32, "{}", lesson.id);
            assert!(
                lesson.hands().iter().all(|hand| hand.len() == 8),
                "{}",
                lesson.id
            );
        }
    }

    #[test]
    fn every_lesson_plays_to_its_end_and_teaches_its_reason() {
        for lesson in lessons() {
            let mut board = lesson.bidding().into_board().expect("a preset board");
            let script = lesson.script();
            for (index, &card) in script.iter().enumerate() {
                if board.reviewing_completed_trick() {
                    board.continue_after_trick().unwrap();
                }
                let seat = board.active_seat();
                let view = board.play_view(seat);
                assert!(
                    view.legal_cards.contains(&card),
                    "{} play {index}: {card} is not legal for seat {seat}",
                    lesson.id
                );
                if lesson.coaches(index) {
                    assert_eq!(seat, 0, "{} play {index} is the player's", lesson.id);
                    let explained = explain_card(&view, card);
                    if index == lesson.coached[0] {
                        assert_eq!(explained.why, lesson.teaches, "{}", lesson.id);
                    }
                    assert_eq!(
                        explained.others.len(),
                        view.legal_cards.len() - 1,
                        "{} play {index}",
                        lesson.id
                    );
                } else {
                    assert_ne!(seat, 0, "{} play {index} is a bot's", lesson.id);
                }
                board.play(seat, card, false).unwrap();
            }
        }
    }

    #[test]
    fn the_scripted_bot_plays_the_script_then_a_legal_card() {
        let lesson = lesson("lead-trump").unwrap();
        let mut board = lesson.bidding().into_board().unwrap();
        let bot = lesson.bot();
        for card in lesson.script() {
            let seat = board.active_seat();
            let view = board.play_view(seat);
            if seat != 0 {
                assert_eq!(bot.choose_card(&view), card);
            }
            if board.reviewing_completed_trick() {
                board.continue_after_trick().unwrap();
            }
            board.play(seat, card, false).unwrap();
        }
        board.continue_after_trick().unwrap();
        let view = board.play_view(board.active_seat());
        assert!(view.legal_cards.contains(&bot.choose_card(&view)));
    }
}
