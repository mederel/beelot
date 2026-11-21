//! The golden run (US-165): scripted, seeded matches whose snapshots, one per viewer after every accepted change, are
//! pinned by their SHA-256. A refactor of the table must leave `tests/golden/*.txt` byte-identical. Run with
//! `UPDATE_GOLDEN=1` to rewrite the files after an intended change, and review the diff.

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use beelot_game::bidding::{AuctionDecision, AuctionView};
use beelot_game::board::PlayView;
use beelot_game::bot::{BotStrategy, strategies};
use beelot_game::{Card, Difficulty, Suit, Trump, Variant};
use beelot_server::api::{Viewer, snapshot};
use beelot_server::tables::reactions::TableReaction;
use beelot_server::tables::{Action, Actor, Lobby, Table, TableKind, TableSetup, local_seats};
use serde_json::Value;
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use time::macros::datetime;
use uuid::Uuid;

const T0: OffsetDateTime = datetime!(2026-11-21 12:00 UTC);
const TABLE_ID: Uuid = Uuid::from_u128(0x0123_4567_89ab_cdef_0123_4567_89ab_cdef);
const REVIEW: Duration = Duration::from_secs(4);
const STEP_CAP: usize = 4_000;

fn setup(seed: i64) -> TableSetup {
    TableSetup::seeded(seed)
        .with_seeded_first_dealer(seed)
        .with_strategy(strategies::for_difficulty(Difficulty::Relaxed))
}

/// A strategy that must never be asked: rebuilding a table from its events runs no bot.
struct NeverAsked;

impl BotStrategy for NeverAsked {
    fn decide_auction(&self, _: &AuctionView) -> AuctionDecision {
        panic!("a replay asked a bot for a call");
    }

    fn choose_card(&self, _: &PlayView) -> Card {
        panic!("a replay asked a bot for a card");
    }
}

static NEVER_ASKED: NeverAsked = NeverAsked;

/// A setup that draws no seed and asks no bot: everything must come from the events.
fn replay_setup() -> TableSetup {
    TableSetup::default()
        .with_seed_source(Arc::new(|| panic!("a replay drew the seed of a deal")))
        .with_first_dealer_source(Arc::new(|| panic!("a replay drew a first dealer")))
        .with_strategy(&NEVER_ASKED)
}

/// What every viewer saw at one version of the table.
struct Seen {
    now: OffsetDateTime,
    snapshots: Vec<(Viewer, Value)>,
}

fn snapshot_json(table: &Table, viewer: Viewer, now: OffsetDateTime) -> Value {
    let mut value: Value = serde_json::to_value(snapshot(table, viewer, now)).unwrap();
    if let Some(bidding) = value.get_mut("bidding") {
        // The auction's id is random, the rest is seeded.
        bidding["auctionId"] = "<auction-id>".into();
    }
    // US-170 added the codes of the texts beside the English the hashes were recorded with: the hashes leave them out,
    // so they still prove that no English text and no other field changed. `message_codes` covers the codes.
    without_codes(&mut value);
    value
}

fn without_codes(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for key in ["messageCode", "callCode", "declarationCode"] {
                object.remove(key);
            }
            object.values_mut().for_each(without_codes);
        }
        Value::Array(items) => items.iter_mut().for_each(without_codes),
        _ => {}
    }
}

/// A table being played, with the lines that pin what each viewer saw.
struct Run {
    table: Table,
    now: OffsetDateTime,
    viewers: Vec<Viewer>,
    lines: String,
    steps: usize,
    calls: usize,
    seen: BTreeMap<u64, Seen>,
}

impl Run {
    fn new(table: Table, viewers: Vec<Viewer>) -> Self {
        let mut run = Self {
            table,
            now: T0,
            viewers,
            lines: String::new(),
            steps: 0,
            calls: 0,
            seen: BTreeMap::new(),
        };
        run.record("start");
        run
    }

    fn record(&mut self, label: &str) {
        self.steps += 1;
        if std::env::var_os("GOLDEN_TRACE").is_some() {
            eprintln!("{:04} {label}", self.steps);
        }
        let mut snapshots = Vec::new();
        for viewer in self.viewers.clone() {
            let value = snapshot_json(&self.table, viewer, self.now);
            snapshots.push((viewer, value.clone()));
            let digest = Sha256::digest(serde_json::to_string(&value).unwrap().as_bytes());
            let hex = digest.iter().fold(String::new(), |mut text, byte| {
                write!(text, "{byte:02x}").unwrap();
                text
            });
            writeln!(self.lines, "{:04} {label} {viewer:?} {hex}", self.steps).unwrap();
        }
        self.seen.insert(
            self.table.version(),
            Seen {
                now: self.now,
                snapshots,
            },
        );
    }

    /// Applies an action that must be accepted, then records the table.
    fn act(&mut self, actor: Actor, action: Action) {
        let label = format!("{actor:?} {action:?}");
        self.now += time::Duration::seconds(5);
        self.table
            .apply(actor, action, self.now)
            .unwrap_or_else(|error| panic!("{label} was refused: {error:?}"));
        self.record(&label);
    }

    /// Tries the actions in order and keeps the first the table accepts (a refusal changes nothing).
    fn first_accepted(&mut self, actor: Actor, candidates: Vec<Action>) {
        for action in candidates {
            let label = format!("{actor:?} {action:?}");
            let at = self.now + time::Duration::seconds(5);
            if self.table.apply(actor, action, at).is_ok() {
                self.now = at;
                self.record(&label);
                return;
            }
        }
        panic!("no candidate was accepted");
    }

    /// The next accepted action of a simple player: a deterministic mix of bids, passes and the first legal card.
    /// Returns false once the match is complete.
    fn step(&mut self, online: bool) -> bool {
        assert!(self.steps < STEP_CAP, "the scenario does not end");
        let device = |seat: usize| {
            if online {
                Actor::Seat(seat)
            } else {
                Actor::Device
            }
        };
        if self
            .table
            .match_score()
            .is_some_and(|score| score.complete())
        {
            return false;
        }
        if let Some(board) = self.table.board() {
            if board.round_result().is_some() {
                self.act(device(0), Action::NextRound);
            } else if board.reviewing_completed_trick() {
                self.act(device(0), Action::ContinueTrick);
            } else {
                let seat = board.active_seat();
                let card = board.legal_cards(seat)[0];
                self.calls += 1;
                let declare = Some(self.calls.is_multiple_of(2));
                self.act(
                    device(seat),
                    Action::Card {
                        rank: card.rank.label().into(),
                        suit: card.suit,
                        declare,
                    },
                );
            }
            return true;
        }
        let seat = self.table.bidding().expect("a started table").active_seat();
        let contree = self.table.lobby().variant() == Variant::Contree;
        let n = self.calls;
        self.calls += 1;
        let suit = Suit::ALL[n % 4];
        let candidates = if contree {
            let trump = [Trump::Clubs, Trump::Diamonds, Trump::Hearts, Trump::Spades][n % 4];
            match n % 7 {
                3 => vec![Action::Coinche, Action::Pass],
                0 | 4 => vec![
                    Action::Contract {
                        value: 80 + 10 * ((n as i32 / 4) % 9),
                        suit: Some(trump),
                    },
                    Action::Pass,
                ],
                _ => vec![Action::Pass],
            }
        } else if n.is_multiple_of(3) {
            vec![Action::Trump { suit }, Action::Pass]
        } else {
            vec![Action::Pass, Action::Trump { suit }]
        };
        self.first_accepted(device(seat), candidates);
        true
    }

    /// A table rebuilt from the events up to each version shows every viewer what the live table showed then, and
    /// the same events rebuild it from nothing but themselves: no bot is asked, no seed is drawn.
    fn check_replay(&self, scenario: &str) {
        let entries = self.table.entries();
        assert!(!entries.is_empty(), "{scenario} made no event");
        assert!(
            self.seen.len() > 10,
            "{scenario} saw too few versions to prove a replay"
        );
        for (version, seen) in &self.seen {
            let cut: Vec<_> = entries
                .iter()
                .filter(|entry| entry.version <= *version)
                .cloned()
                .collect();
            let rebuilt = Table::replay(self.table.origin(), replay_setup(), &cut)
                .unwrap_or_else(|error| panic!("{scenario}: replay to {version} failed: {error}"));
            assert_eq!(rebuilt.version(), *version, "{scenario}: the version");
            for (viewer, live) in &seen.snapshots {
                assert_eq!(
                    &snapshot_json(&rebuilt, *viewer, seen.now),
                    live,
                    "{scenario}: {viewer:?} at version {version} differs after a replay"
                );
            }
        }
    }

    fn finish(self, scenario: &str) {
        self.check_replay(scenario);
        let path: PathBuf = [
            env!("CARGO_MANIFEST_DIR"),
            "tests",
            "golden",
            &format!("{scenario}.txt"),
        ]
        .iter()
        .collect();
        if std::env::var_os("UPDATE_GOLDEN").is_some() {
            std::fs::write(&path, &self.lines).unwrap();
            return;
        }
        let expected = std::fs::read_to_string(&path)
            .unwrap_or_else(|_| panic!("{} is missing: run with UPDATE_GOLDEN=1", path.display()));
        for (number, (got, want)) in self.lines.lines().zip(expected.lines()).enumerate() {
            assert_eq!(
                got,
                want,
                "{scenario}: line {} changed: run with UPDATE_GOLDEN=1 only if the change is intended",
                number + 1
            );
        }
        assert_eq!(
            self.lines.lines().count(),
            expected.lines().count(),
            "{scenario}: the number of lines changed"
        );
    }
}

fn solo(variant: Variant, all_trumps: bool, target: i32, seed: i64) -> Run {
    let lobby = Lobby::local(
        local_seats(None).unwrap(),
        variant,
        true,
        all_trumps,
        target,
    );
    let table = Table::local(TABLE_ID, Difficulty::Relaxed, lobby, setup(seed), T0);
    Run::new(table, vec![Viewer::Device])
}

fn online_viewers() -> Vec<Viewer> {
    vec![
        Viewer::Seat(0),
        Viewer::Seat(1),
        Viewer::Seat(2),
        Viewer::Seat(3),
        Viewer::Spectator,
    ]
}

#[test]
fn solo_classic_with_an_undo_and_a_rematch() {
    let mut run = solo(Variant::Classic, true, 500, 11);
    let mut undone = false;
    let mut rematched = false;
    loop {
        if !run.step(false) {
            if rematched {
                break;
            }
            run.act(Actor::Device, Action::Rematch);
            rematched = true;
        }
        if !undone && run.table.undo_offered() {
            run.act(Actor::Device, Action::Undo);
            undone = true;
        }
    }
    assert!(undone, "the scenario takes a card back");
    run.finish("solo_classic");
}

#[test]
fn solo_contree_with_all_trumps() {
    let mut run = solo(Variant::Contree, true, 1_000, 8);
    while run.step(false) {}
    run.finish("solo_contree");
}

#[test]
fn pass_and_play_between_two_humans() {
    let seats = local_seats(Some(&[Some("Ana".into()), Some("Ben".into()), None, None])).unwrap();
    let lobby = Lobby::local(seats, Variant::Contree, true, true, 1_000);
    let table = Table::local(TABLE_ID, Difficulty::Relaxed, lobby, setup(8), T0);
    let mut run = Run::new(table, vec![Viewer::Device]);
    while run.step(false) {}
    run.finish("pass_and_play");
}

#[test]
fn a_private_table_of_four_humans() {
    let lobby = Lobby::private("Ana".into(), None, Variant::Contree);
    let table = Table::online(
        TABLE_ID,
        TableKind::Private,
        Some("ABC234".into()),
        lobby,
        setup(7),
        T0,
    );
    let mut run = Run::new(table, online_viewers());
    for name in ["Ben", "Cleo"] {
        run.table.join(name.into(), None, T0).unwrap();
        run.record(&format!("join {name}"));
    }
    // Ben moves to the last seat, and Dan then takes the one he left.
    run.act(Actor::Seat(1), Action::Seat { position: 3 });
    run.table.join("Dan".into(), None, T0).unwrap();
    run.record("join Dan");
    run.act(
        Actor::Seat(0),
        Action::Settings {
            announcements: Some(false),
            all_trumps: Some(false),
            turn_timer: Some(30),
            target: Some(500),
        },
    );
    run.act(Actor::Seat(0), Action::Spectators { allowed: true });
    for seat in 0..4 {
        run.act(Actor::Seat(seat), Action::Ready { ready: true });
    }
    run.act(
        Actor::Seat(0),
        Action::Start {
            fill_with_bots: false,
        },
    );
    run.act(
        Actor::Seat(2),
        Action::React {
            reaction: TableReaction::WellPlayed,
        },
    );
    // A seat's stream drops and comes back.
    run.table.disconnect(1, run.now).unwrap();
    run.record("disconnect 1");
    run.table.reconnect(1).unwrap();
    run.record("reconnect 1");
    let mut asked = false;
    loop {
        if !run.step(true) {
            if asked {
                break;
            }
            for seat in 0..4 {
                run.act(Actor::Seat(seat), Action::Rematch);
            }
            asked = true;
        }
    }
    run.finish("private_four_humans");
}

#[test]
fn a_public_table_filled_with_bots_whose_player_leaves() {
    let lobby = Lobby::public(
        "Ana".into(),
        None,
        Variant::Contree,
        T0 + time::Duration::seconds(60),
    );
    let table = Table::online(TABLE_ID, TableKind::Public, None, lobby, setup(9), T0);
    let mut run = Run::new(table, online_viewers());
    run.now = T0 + time::Duration::seconds(61);
    assert!(run.table.fill_with_bots_if_due(run.now));
    run.record("bots fill the table");
    // Cards, with the completed trick collected by the sweep, as at an online table.
    let mut played = 0;
    while played < 40 {
        run.step_online_sweeping();
        played += 1;
    }
    // The player's stream drops for good: a bot takes the seat and finishes the match.
    run.table.disconnect(0, run.now).unwrap();
    run.record("disconnect 0");
    run.now += time::Duration::minutes(3);
    run.table
        .replace_expired_disconnections(run.now, Duration::from_secs(120));
    run.record("a bot takes over");
    let account = Uuid::from_u128(1);
    run.table.release_account(account, run.now);
    run.record("release an account nobody holds");
    run.finish("public_with_bots");
}

impl Run {
    /// One step at an online table where a completed trick waits for the sweep instead of a click.
    fn step_online_sweeping(&mut self) {
        let board_state = self.table.board().map(|board| {
            (
                board.round_result().is_some(),
                board.reviewing_completed_trick(),
            )
        });
        match board_state {
            Some((false, true)) => {
                self.now += time::Duration::seconds(5);
                let count = self
                    .table
                    .trick_review_due(self.now, REVIEW)
                    .expect("a trick shown for five seconds is due");
                self.table
                    .collect_trick(count, self.now)
                    .expect("the trick is collected");
                self.record("the sweep collects the trick");
            }
            _ => {
                self.step(true);
            }
        }
    }
}
