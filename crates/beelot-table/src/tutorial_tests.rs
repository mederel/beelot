//! The tutorial table (US-199): lessons played through, a coach that accepts only its card, a free game that is never
//! handed to the history.

use beelot_game::Card;
use beelot_game::bot::hints::{CardReason, WhyNot};
use time::OffsetDateTime;
use time::macros::datetime;
use uuid::Uuid;

use crate::tutorial::{Tutorial, lesson, lessons};
use crate::{Action, Actor, Refusal, Table, TableSetup};

const T0: OffsetDateTime = datetime!(2026-11-23 12:00 UTC);

fn card(code: &str) -> Card {
    code.parse().unwrap()
}

fn lesson_table(id: &str) -> Table {
    Table::tutorial(
        Uuid::new_v4(),
        Tutorial::Lesson { id: id.into() },
        TableSetup::seeded(1),
        T0,
    )
    .unwrap()
}

fn play(table: &mut Table, card: Card) -> Result<crate::Outcome, Refusal> {
    table.apply(
        Actor::Device,
        Action::Card {
            rank: card.rank.label().into(),
            suit: card.suit,
            declare: None,
        },
        T0,
    )
}

fn code(refusal: Refusal) -> &'static str {
    match refusal {
        Refusal::Conflict { code, .. } => code,
        other => panic!("not a conflict: {other:?}"),
    }
}

#[test]
fn a_lesson_table_starts_in_the_play_with_the_lessons_hands() {
    for lesson in lessons() {
        let table = lesson_table(lesson.id);
        let board = table.board().expect("a lesson starts in the play");
        let hands = lesson.hands();
        for seat in 0..4 {
            let mut held = board.hand(seat).to_vec();
            let mut expected = hands[seat].clone();
            let by_code = |card: &Card| card.to_string();
            held.sort_by_key(by_code);
            expected.sort_by_key(by_code);
            // Bots that play before the player have already played the script's first cards.
            assert!(
                held.iter().all(|card| expected.contains(card)),
                "{}",
                lesson.id
            );
        }
        assert_eq!(
            table.tutorial_kind().cloned(),
            Some(Tutorial::Lesson {
                id: lesson.id.into()
            })
        );
    }
}

#[test]
fn the_coach_names_the_scripted_card_on_the_players_turn() {
    let table = lesson_table("win-cheaply");
    let coach = table.coach().expect("the player's turn");
    assert_eq!(coach.card, card("JD"));
    assert_eq!(coach.why, CardReason::WinCheaply);
    assert_eq!(coach.others, vec![(card("AD"), WhyNot::TooStrong)]);
    let progress = coach.lesson.expect("a lesson");
    assert_eq!((progress.number, progress.lessons), (2, 6));
    assert_eq!((progress.step, progress.steps), (0, 2));
}

#[test]
fn a_legal_card_that_is_not_coached_is_refused_and_changes_nothing() {
    let mut table = lesson_table("win-cheaply");
    let version = table.version();
    let hand = table.board().unwrap().hand(0).to_vec();
    let refusal = play(&mut table, card("AD")).unwrap_err();
    assert_eq!(code(refusal), "tutorial-card");
    assert_eq!(table.version(), version);
    assert_eq!(table.board().unwrap().hand(0), hand.as_slice());
}

#[test]
fn an_illegal_card_keeps_its_usual_refusal() {
    let mut table = lesson_table("win-cheaply");
    let refusal = play(&mut table, card("7H")).unwrap_err();
    assert_eq!(code(refusal), "illegal-card");
}

#[test]
fn there_is_no_coach_outside_the_players_turn() {
    let mut table = lesson_table("win-cheaply");
    play(&mut table, card("JD")).unwrap();
    assert!(table.coach().is_none(), "the trick is being reviewed");
}

#[test]
fn playing_the_coached_cards_finishes_every_lesson() {
    for lesson in lessons() {
        let mut table = lesson_table(lesson.id);
        assert!(!table.lesson_done(), "{}", lesson.id);
        let mut steps = 0;
        while !table.lesson_done() {
            if table.board().unwrap().reviewing_completed_trick() {
                table
                    .apply(Actor::Device, Action::ContinueTrick, T0)
                    .unwrap();
                continue;
            }
            let coach = table
                .coach()
                .unwrap_or_else(|| panic!("{}: no coach at step {steps}", lesson.id));
            play(&mut table, coach.card).unwrap();
            steps += 1;
            assert!(steps <= 8, "{} does not end", lesson.id);
        }
        assert_eq!(steps, lesson.coached.len(), "{}", lesson.id);
    }
}

#[test]
fn a_lesson_that_is_not_listed_is_not_found() {
    let made = Table::tutorial(
        Uuid::new_v4(),
        Tutorial::Lesson { id: "nope".into() },
        TableSetup::seeded(1),
        T0,
    );
    assert!(matches!(made, Err(Refusal::NotFound)));
    assert!(lesson("nope").is_none());
}

#[test]
fn the_free_game_is_coached_to_the_end_and_never_handed_to_the_history() {
    let mut table =
        Table::tutorial(Uuid::new_v4(), Tutorial::Free, TableSetup::seeded(7), T0).unwrap();
    for turn in 0..5_000 {
        if table.match_score().is_some_and(|score| score.complete()) {
            return;
        }
        let outcome = if let Some(bidding) = table.bidding().filter(|_| table.board().is_none()) {
            assert!(table.coach().is_none(), "no card to coach in the auction");
            let suit = bidding.upturned_card().expect("a classic deal").suit;
            table.apply(Actor::Device, Action::Trump { suit }, T0)
        } else if table.board().unwrap().round_result().is_some() {
            table.apply(Actor::Device, Action::NextRound, T0)
        } else if table.board().unwrap().reviewing_completed_trick() {
            table.apply(Actor::Device, Action::ContinueTrick, T0)
        } else {
            let coach = table.coach().expect("the player's turn to play");
            let legal = table.board().unwrap().legal_cards(0);
            assert!(legal.contains(&coach.card), "turn {turn}");
            assert_eq!(coach.others.len(), legal.len() - 1);
            play(&mut table, coach.card)
        }
        .unwrap_or_else(|refusal| panic!("turn {turn}: {refusal}"));
        assert!(
            outcome.finished.is_none(),
            "a tutorial match is not recorded"
        );
    }
    panic!("the match does not end");
}
