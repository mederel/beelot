//! Tests of matchmaking, public tables, the memory bounds and the registry's private tables.

use std::sync::Arc;
use std::time::Duration;

use beelot_game::bot::strategies;
use beelot_game::{Difficulty, Variant};
use time::macros::datetime;
use uuid::Uuid;

use super::*;
use crate::clock::FakeClock;
use crate::config::Limits;
use crate::error::AppError;
use crate::tables::reactions::TableReaction;
use crate::tables::{Action, Actor, Connection, Status, Table, TableKind, TableSetup};

fn registry_with(limits: Limits) -> (TableRegistry, Arc<FakeClock>) {
    let clock = Arc::new(FakeClock::new(datetime!(2026-10-24 12:00 UTC)));
    let registry = TableRegistry::new(&limits, clock.clone()).with_setup(|| {
        TableSetup::seeded(7).with_strategy(strategies::for_difficulty(Difficulty::Relaxed))
    });
    (registry, clock)
}

fn registry() -> (TableRegistry, Arc<FakeClock>) {
    registry_with(Limits::default())
}

fn conflict(error: AppError) -> String {
    match error {
        AppError::Conflict { message, .. } => message.english().to_owned(),
        other => panic!("not a conflict: {other:?}"),
    }
}

/// Reads the table through its task, in order with its commands.
async fn read<T: Send + 'static>(
    registry: &TableRegistry,
    id: Uuid,
    read: impl FnOnce(&Table) -> T + Send + 'static,
) -> T {
    registry.handle(id).unwrap().ask(read).await.unwrap()
}

async fn status(registry: &TableRegistry, id: Uuid) -> Status {
    read(registry, id, |table| table.lobby().status()).await
}

async fn seat_count(registry: &TableRegistry, id: Uuid) -> usize {
    read(registry, id, |table| table.lobby().occupied().count()).await
}

async fn act(registry: &TableRegistry, access: &Access, action: Action) -> Result<(), AppError> {
    let (handle, actor) = registry.authorize(access.table_id, &access.player_token)?;
    registry.act(&handle, actor, action).await.map(|_| ())
}

/// Lets the tables' tasks run what is ready.
async fn settle() {
    for _ in 0..20 {
        tokio::task::yield_now().await;
    }
}

/// Moves the clock and tokio's time together, so the tables' deadlines fire when the clock says.
async fn advance(clock: &FakeClock, by: time::Duration) {
    clock.advance(by);
    tokio::time::advance(by.unsigned_abs()).await;
    settle().await;
}

// Tokens

#[tokio::test(start_paused = true)]
async fn a_token_authorizes_its_seat_at_its_table_only() {
    let (registry, _) = registry();
    let ana = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let code = ana.code.clone().unwrap();
    let ben = registry.join(&code, "Ben", None).await.unwrap();
    let other = registry
        .create_private("Chloe", Variant::Classic, None)
        .unwrap();

    assert_eq!(
        registry
            .authorize(ana.table_id, &ana.player_token)
            .unwrap()
            .1,
        Actor::Seat(0)
    );
    assert_eq!(
        registry
            .authorize(ben.table_id, &ben.player_token)
            .unwrap()
            .1,
        Actor::Seat(1)
    );
    assert!(matches!(
        registry.authorize(other.table_id, &ana.player_token),
        Err(AppError::Unauthorized { .. })
    ));
    assert!(matches!(
        registry.authorize(ana.table_id, "not-a-token"),
        Err(AppError::Unauthorized { .. })
    ));
    assert!(matches!(
        registry.authorize(Uuid::new_v4(), &ana.player_token),
        Err(AppError::NotFound)
    ));
}

#[tokio::test(start_paused = true)]
async fn tokens_are_long_random_and_url_safe() {
    let (registry, _) = registry();
    let first = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let second = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    assert_ne!(first.player_token, second.player_token);
    assert_eq!(first.player_token.len(), 43, "32 bytes in unpadded base64");
    assert!(
        first
            .player_token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    );
}

#[tokio::test(start_paused = true)]
async fn token_hash_only() {
    let (registry, _) = registry();
    let access = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let local = registry
        .create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            None,
        )
        .unwrap();
    let debug = format!(
        "{registry:?} {:?} {:?}",
        registry.handle(access.table_id).unwrap(),
        access
    );
    assert!(!debug.contains(&access.player_token));
    assert!(!debug.contains(&local.player_token));
}

#[tokio::test(start_paused = true)]
async fn a_token_follows_its_player_to_another_seat() {
    let (registry, _) = registry();
    let ana = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let ben = registry
        .join(ana.code.as_deref().unwrap(), "Ben", None)
        .await
        .unwrap();
    act(&registry, &ben, Action::Seat { position: 2 })
        .await
        .unwrap();
    assert_eq!(
        registry
            .authorize(ben.table_id, &ben.player_token)
            .unwrap()
            .1,
        Actor::Seat(2)
    );
    act(&registry, &ben, Action::Ready { ready: true })
        .await
        .unwrap();
    assert!(
        read(&registry, ben.table_id, |table| table
            .lobby()
            .seat(2)
            .unwrap()
            .ready)
        .await
    );
}

#[tokio::test(start_paused = true)]
async fn a_player_who_leaves_loses_their_token() {
    let (registry, _) = registry();
    let ana = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let ben = registry
        .join(ana.code.as_deref().unwrap(), "Ben", None)
        .await
        .unwrap();
    act(&registry, &ben, Action::Leave).await.unwrap();
    assert!(registry.authorize(ben.table_id, &ben.player_token).is_err());
    let chloe = registry
        .join(ana.code.as_deref().unwrap(), "Chloe", None)
        .await
        .unwrap();
    assert_eq!(
        registry
            .authorize(chloe.table_id, &chloe.player_token)
            .unwrap()
            .1,
        Actor::Seat(1)
    );
}

#[tokio::test(start_paused = true)]
async fn every_change_is_published() {
    let (registry, _) = registry();
    let ana = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let handle = registry.handle(ana.table_id).unwrap();
    let mut changes = handle.subscribe();
    let before = changes.borrow_and_update().version;
    registry
        .join(ana.code.as_deref().unwrap(), "Ben", None)
        .await
        .unwrap();
    assert!(changes.has_changed().unwrap());
    let after = changes.borrow_and_update().version;
    assert!(after > before);
    act(&registry, &ana, Action::Ready { ready: true })
        .await
        .unwrap();
    assert!(changes.borrow_and_update().version > after);
}

// Invitation codes

#[tokio::test(start_paused = true)]
async fn invitation_codes_use_six_unambiguous_characters() {
    for _ in 0..200 {
        let code = codes::new_code(|_| false);
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| codes::ALPHABET.contains(c)), "{code}");
    }
    let mut calls = 0;
    let code = codes::new_code(|_| {
        calls += 1;
        calls < 3
    });
    assert_eq!(calls, 3, "a taken code is drawn again");
    assert_eq!(code.len(), 6);
}

#[tokio::test(start_paused = true)]
async fn codes_are_matched_trimmed_and_upper_cased() {
    let (registry, _) = registry();
    let ana = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let code = ana.code.clone().unwrap();
    let ben = registry
        .join(&format!("  {}  ", code.to_lowercase()), "Ben", None)
        .await
        .unwrap();
    assert_eq!(ben.table_id, ana.table_id);
    assert_eq!(
        conflict(registry.join("NOPE42", "Chloe", None).await.unwrap_err()),
        "The invitation code is invalid."
    );
    let long = format!("{code}{}", " ".repeat(40));
    assert_eq!(
        conflict(registry.join(&long, "Chloe", None).await.unwrap_err()),
        "The invitation code is invalid."
    );
}

#[tokio::test(start_paused = true)]
async fn creating_and_joining_need_a_name() {
    let (registry, _) = registry();
    assert_eq!(
        conflict(
            registry
                .create_private(" ", Variant::Classic, None)
                .unwrap_err()
        ),
        "Enter a player name."
    );
    let ana = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    assert_eq!(
        conflict(
            registry
                .join(ana.code.as_deref().unwrap(), &"x".repeat(200), None)
                .await
                .unwrap_err()
        ),
        "Player names are limited to 30 characters."
    );
}

// MatchmakingServiceTest

#[tokio::test(start_paused = true)]
async fn first_player_opens_a_table() {
    let (registry, _) = registry();
    let access = registry
        .quick_match("Ana", Variant::Classic, None)
        .await
        .unwrap();
    let (kind, public, seated) = read(&registry, access.table_id, |table| {
        (
            table.kind,
            table.lobby().is_public(),
            table.lobby().occupied().count(),
        )
    })
    .await;
    assert_eq!(kind, TableKind::Public);
    assert!(public);
    assert_eq!(seated, 1);
    assert_eq!(access.code, None);
}

#[tokio::test(start_paused = true)]
async fn players_of_the_same_variant_share_a_table() {
    let (registry, _) = registry();
    let first = registry
        .quick_match("Ana", Variant::Classic, None)
        .await
        .unwrap();
    let second = registry
        .quick_match("Benoit", Variant::Classic, None)
        .await
        .unwrap();
    assert_eq!(first.table_id, second.table_id);
    assert_eq!(seat_count(&registry, second.table_id).await, 2);
}

#[tokio::test(start_paused = true)]
async fn variants_are_not_mixed() {
    let (registry, _) = registry();
    let classic = registry
        .quick_match("Ana", Variant::Classic, None)
        .await
        .unwrap();
    let contree = registry
        .quick_match("Benoit", Variant::Contree, None)
        .await
        .unwrap();
    assert_ne!(classic.table_id, contree.table_id);
}

#[tokio::test(start_paused = true)]
async fn quick_match_prefers_fullest_table() {
    let (registry, clock) = registry();
    let emptier = registry
        .open_public("David", Variant::Classic, None)
        .unwrap();
    advance(&clock, time::Duration::seconds(1)).await;
    let fuller = registry.open_public("Ana", Variant::Classic, None).unwrap();
    registry
        .join_public(fuller.table_id, "Benoit", None)
        .await
        .unwrap();
    registry
        .join_public(fuller.table_id, "Chloe", None)
        .await
        .unwrap();

    let emma = registry
        .quick_match("Emma", Variant::Classic, None)
        .await
        .unwrap();
    assert_eq!(emma.table_id, fuller.table_id);
    assert_eq!(status(&registry, fuller.table_id).await, Status::InProgress);

    // Equally full tables: the one whose bots come first.
    let later = registry
        .open_public("Hugo", Variant::Classic, None)
        .unwrap();
    let next = registry
        .quick_match("Ines", Variant::Classic, None)
        .await
        .unwrap();
    assert_eq!(next.table_id, emptier.table_id);
    assert_ne!(next.table_id, later.table_id);
}

#[tokio::test(start_paused = true)]
async fn four_quick_matches_start_one_game_and_the_fifth_opens_a_new_table() {
    let (registry, _) = registry();
    let mut table = None;
    for name in ["Ana", "Benoit", "Chloe", "David"] {
        let seated = registry
            .quick_match(name, Variant::Classic, None)
            .await
            .unwrap()
            .table_id;
        if let Some(table) = table {
            assert_eq!(table, seated);
        }
        table = Some(seated);
    }
    let table = table.unwrap();
    assert_eq!(status(&registry, table).await, Status::InProgress);
    let fifth = registry
        .quick_match("Emma", Variant::Classic, None)
        .await
        .unwrap();
    assert_ne!(fifth.table_id, table);
    assert_eq!(seat_count(&registry, fifth.table_id).await, 1);
}

#[tokio::test(start_paused = true)]
async fn after_the_last_player_leaves_a_new_table_is_opened() {
    let (registry, _) = registry();
    let first = registry
        .quick_match("Ana", Variant::Classic, None)
        .await
        .unwrap();
    act(&registry, &first, Action::Leave).await.unwrap();
    assert!(
        registry.handle(first.table_id).is_none(),
        "the empty table is removed"
    );
    let next = registry
        .quick_match("Benoit", Variant::Classic, None)
        .await
        .unwrap();
    assert_ne!(first.table_id, next.table_id);
}

#[tokio::test(start_paused = true)]
async fn parallel_quick_matches_fill_tables_completely() {
    let (registry, _) = registry();
    let registry = Arc::new(registry);
    let mut players = tokio::task::JoinSet::new();
    for index in 0..8 {
        let registry = registry.clone();
        players.spawn(async move {
            registry
                .quick_match(&format!("Player {index}"), Variant::Classic, None)
                .await
                .unwrap()
                .table_id
        });
    }
    let mut seated: Vec<Uuid> = Vec::new();
    while let Some(table) = players.join_next().await {
        seated.push(table.unwrap());
    }
    let mut distinct = seated.clone();
    distinct.sort();
    distinct.dedup();
    assert_eq!(distinct.len(), 2);
    for table in distinct {
        assert_eq!(status(&registry, table).await, Status::InProgress);
        assert_eq!(seat_count(&registry, table).await, 4);
    }
}

#[tokio::test(start_paused = true)]
async fn rejects_a_blank_name() {
    let (registry, _) = registry();
    assert!(
        registry
            .quick_match(" ", Variant::Classic, None)
            .await
            .is_err()
    );
}

// PublicTableServiceTest

#[tokio::test(start_paused = true)]
async fn open_public_creates_a_waiting_public_table() {
    let (registry, clock) = registry();
    let access = registry.open_public("Ana", Variant::Classic, None).unwrap();
    let (code, bot_fill_at) = read(&registry, access.table_id, |table| {
        (table.invitation_code.clone(), table.lobby().bot_fill_at())
    })
    .await;
    assert_eq!(code, None);
    assert_eq!(bot_fill_at, Some(clock.now() + Duration::from_secs(60)));
    assert_eq!(
        registry.open_public_tables(Variant::Classic),
        [access.table_id]
    );
    assert!(registry.open_public_tables(Variant::Contree).is_empty());
}

#[tokio::test(start_paused = true)]
async fn public_tables_always_play_with_announcements() {
    let (registry, _) = registry();
    let access = registry.open_public("Ana", Variant::Classic, None).unwrap();
    let refused = act(
        &registry,
        &access,
        Action::Settings {
            announcements: Some(false),
            all_trumps: None,
            turn_timer: None,
            target: None,
        },
    )
    .await;
    assert_eq!(
        conflict(refused.unwrap_err()),
        "Public tables always play with announcements."
    );
}

#[tokio::test(start_paused = true)]
async fn fourth_public_join_begins_the_match() {
    let (registry, _) = registry();
    let id = registry
        .open_public("Ana", Variant::Classic, None)
        .unwrap()
        .table_id;
    registry.join_public(id, "Benoit", None).await.unwrap();
    registry.join_public(id, "Chloe", None).await.unwrap();
    registry.join_public(id, "David", None).await.unwrap();
    let (status, cards) = read(&registry, id, |table| {
        (
            table.lobby().status(),
            table.bidding().unwrap().hand(3).len(),
        )
    })
    .await;
    assert_eq!(status, Status::InProgress);
    assert_eq!(cards, 5);
    assert!(registry.open_public_tables(Variant::Classic).is_empty());
}

#[tokio::test(start_paused = true)]
async fn join_public_rejects_private_tables() {
    let (registry, _) = registry();
    let private = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    assert_eq!(
        conflict(
            registry
                .join_public(private.table_id, "Benoit", None)
                .await
                .unwrap_err()
        ),
        "This table does not exist."
    );
}

#[tokio::test(start_paused = true)]
async fn the_sweep_fills_public_tables_with_bots_once_their_wait_is_over() {
    let (registry, clock) = registry();
    let owner = registry.open_public("Ana", Variant::Classic, None).unwrap();
    registry
        .join_public(owner.table_id, "Benoit", None)
        .await
        .unwrap();

    advance(&clock, time::Duration::seconds(59)).await;
    assert_eq!(
        status(&registry, owner.table_id).await,
        Status::WaitingForPlayers
    );

    advance(&clock, time::Duration::seconds(2)).await;
    let (status, seated, cards) = read(&registry, owner.table_id, |table| {
        (
            table.lobby().status(),
            table.lobby().occupied().count(),
            table.bidding().unwrap().hand(0).len(),
        )
    })
    .await;
    assert_eq!(status, Status::InProgress);
    assert_eq!(seated, 4);
    assert_eq!(cards, 5);
}

#[tokio::test(start_paused = true)]
async fn fill_after_auto_start_does_nothing() {
    let (registry, clock) = registry();
    let id = registry
        .open_public("Ana", Variant::Classic, None)
        .unwrap()
        .table_id;
    for name in ["Benoit", "Chloe", "David"] {
        registry.join_public(id, name, None).await.unwrap();
    }
    let hand = read(&registry, id, |table| {
        table.bidding().unwrap().hand(0).to_vec()
    })
    .await;
    advance(&clock, time::Duration::seconds(61)).await;
    assert_eq!(
        read(&registry, id, |table| table
            .bidding()
            .unwrap()
            .hand(0)
            .to_vec())
        .await,
        hand
    );
}

#[tokio::test(start_paused = true)]
async fn owner_leaving_then_bot_fill_still_plays() {
    let (registry, clock) = registry();
    let owner = registry.open_public("Ana", Variant::Classic, None).unwrap();
    let joiner = registry
        .join_public(owner.table_id, "Benoit", None)
        .await
        .unwrap();
    act(&registry, &owner, Action::Leave).await.unwrap();
    assert_eq!(seat_count(&registry, owner.table_id).await, 1);
    advance(&clock, time::Duration::seconds(61)).await;
    assert_eq!(status(&registry, owner.table_id).await, Status::InProgress);
    assert!(
        registry
            .authorize(owner.table_id, &owner.player_token)
            .is_err()
    );
    assert!(
        registry
            .authorize(joiner.table_id, &joiner.player_token)
            .is_ok()
    );
}

#[tokio::test(start_paused = true)]
async fn last_leave_removes_the_table() {
    let (registry, _) = registry();
    let owner = registry.open_public("Ana", Variant::Classic, None).unwrap();
    act(&registry, &owner, Action::Leave).await.unwrap();
    assert_eq!(registry.counts(), (0, 0));
    assert!(registry.handle(owner.table_id).is_none());
}

#[tokio::test(start_paused = true)]
async fn leave_after_start_fails() {
    let (registry, _) = registry();
    let owner = registry.open_public("Ana", Variant::Classic, None).unwrap();
    for name in ["Benoit", "Chloe", "David"] {
        registry
            .join_public(owner.table_id, name, None)
            .await
            .unwrap();
    }
    assert!(act(&registry, &owner, Action::Leave).await.is_err());
}

// Presence

#[tokio::test(start_paused = true)]
async fn the_sweep_hands_expired_disconnections_to_bots() {
    let (registry, clock) = registry();
    let owner = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let handle = registry.handle(owner.table_id).unwrap();
    // The seat's last stream closes: the task disconnects it.
    handle.stream_closed(0, clock.now());
    settle().await;
    let connection = || {
        read(&registry, owner.table_id, |table| {
            table.lobby().seat(0).unwrap().connection
        })
    };
    assert!(matches!(
        connection().await,
        Connection::Disconnected { .. }
    ));
    advance(&clock, time::Duration::seconds(119)).await;
    assert!(matches!(
        connection().await,
        Connection::Disconnected { .. }
    ));
    advance(&clock, time::Duration::seconds(1)).await;
    assert_eq!(connection().await, Connection::BotTakeover);
}

#[tokio::test(start_paused = true)]
async fn the_sweep_collects_a_trick_four_seconds_after_it_is_shown() {
    let (registry, clock) = registry();
    let owner = registry
        .create_private("Ana", Variant::Contree, None)
        .unwrap();
    act(&registry, &owner, Action::Ready { ready: true })
        .await
        .unwrap();
    act(
        &registry,
        &owner,
        Action::Start {
            fill_with_bots: true,
        },
    )
    .await
    .unwrap();
    loop {
        let action = read(&registry, owner.table_id, |table| match table.board() {
            None if table.bidding().unwrap().highest_bid() < 80 => Some(Action::Contract {
                value: 80,
                suit: Some(beelot_game::Trump::Hearts),
            }),
            None => Some(Action::Pass),
            Some(board) if board.reviewing_completed_trick() => None,
            Some(board) => {
                let card = board.legal_cards(0)[0];
                Some(Action::Card {
                    rank: card.rank.label().into(),
                    suit: card.suit,
                    declare: None,
                })
            }
        })
        .await;
        let Some(action) = action else { break };
        act(&registry, &owner, action).await.unwrap();
    }
    let shown = || {
        read(&registry, owner.table_id, |table| {
            table.board().unwrap().reviewing_completed_trick()
        })
    };
    advance(&clock, time::Duration::milliseconds(3999)).await;
    assert!(shown().await, "not before 4 seconds");
    advance(&clock, time::Duration::milliseconds(1)).await;
    assert!(
        !shown().await,
        "collected exactly 4 seconds after it was shown"
    );
}

// MemoryBoundsTest

#[tokio::test(start_paused = true)]
async fn local_tables_are_capped_and_idle_tables_free_capacity() {
    let (registry, clock) = registry_with(Limits {
        max_local_tables: 2,
        ..Limits::default()
    });
    let first = registry
        .create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            None,
        )
        .unwrap();
    registry
        .create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            None,
        )
        .unwrap();
    assert!(matches!(
        registry.create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            None
        ),
        Err(AppError::CapacityExceeded)
    ));
    assert_eq!(registry.counts(), (2, 0));

    advance(
        &clock,
        time::Duration::hours(2) + time::Duration::seconds(1),
    )
    .await;
    let third = registry.create_local(
        Variant::Classic,
        Difficulty::Relaxed,
        LocalOptions::default(),
        None,
        None,
    );
    assert!(third.is_ok(), "idle tables are evicted to make room");
    assert!(registry.handle(first.table_id).is_none());
    assert_eq!(registry.counts().0, 1);
}

#[tokio::test(start_paused = true)]
async fn online_tables_are_capped_and_idle_tables_evicted_with_their_codes() {
    let (registry, clock) = registry_with(Limits {
        max_online_tables: 1,
        ..Limits::default()
    });
    let first = registry
        .create_private("Ann", Variant::Classic, None)
        .unwrap();
    assert!(matches!(
        registry.create_private("Bob", Variant::Classic, None),
        Err(AppError::CapacityExceeded)
    ));
    assert!(matches!(
        registry.quick_match("Bob", Variant::Classic, None).await,
        Err(AppError::CapacityExceeded)
    ));
    advance(&clock, time::Duration::hours(3)).await;
    registry
        .create_private("Bob", Variant::Classic, None)
        .unwrap();
    assert_eq!(
        conflict(
            registry
                .join(first.code.as_deref().unwrap(), "Cy", None)
                .await
                .unwrap_err()
        ),
        "The invitation code is invalid."
    );
    assert_eq!(registry.counts(), (0, 1));
}

#[tokio::test(start_paused = true)]
async fn local_and_online_tables_have_separate_caps() {
    let (registry, _) = registry_with(Limits {
        max_local_tables: 1,
        max_online_tables: 1,
        ..Limits::default()
    });
    registry
        .create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            None,
        )
        .unwrap();
    registry
        .create_private("Ann", Variant::Classic, None)
        .unwrap();
    assert_eq!(registry.counts(), (1, 1));
}

#[tokio::test(start_paused = true)]
async fn a_used_table_is_not_idle() {
    let (registry, clock) = registry();
    let access = registry
        .create_private("Ann", Variant::Classic, None)
        .unwrap();
    advance(&clock, time::Duration::minutes(90)).await;
    act(&registry, &access, Action::Ready { ready: true })
        .await
        .unwrap();
    advance(&clock, time::Duration::minutes(90)).await;
    assert!(registry.handle(access.table_id).is_some());
}

// Local tables

#[tokio::test(start_paused = true)]
async fn a_solo_table_belongs_to_its_account_and_a_device_token() {
    let (registry, _) = registry();
    let account = Uuid::new_v4();
    let access = registry
        .create_local(
            Variant::Contree,
            Difficulty::Challenging,
            LocalOptions {
                announcements: false,
                ..LocalOptions::default()
            },
            None,
            Some(account),
        )
        .unwrap();
    let (handle, actor) = registry
        .authorize(access.table_id, &access.player_token)
        .unwrap();
    assert_eq!(actor, Actor::Device);
    assert_eq!(handle.kind, TableKind::Local);
    let (difficulty, owner, announcements, dealt) = handle
        .ask(|table| {
            (
                table.difficulty,
                table.lobby().seat(0).unwrap().account,
                table.lobby().announcements(),
                table.bidding().is_some(),
            )
        })
        .await
        .unwrap();
    assert_eq!(difficulty, Some(Difficulty::Challenging));
    assert_eq!(owner, Some(account));
    assert!(!announcements);
    assert!(dealt, "a local table is dealt at once");
}

#[tokio::test(start_paused = true)]
async fn a_pass_and_play_table_belongs_to_no_account() {
    let (registry, _) = registry();
    let seats = vec![Some("Ana".into()), None, Some("Ben".into()), None];
    let access = registry
        .create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            Some(seats),
            Some(Uuid::new_v4()),
        )
        .unwrap();
    let (pass_and_play, no_account) = read(&registry, access.table_id, |table| {
        (
            table.pass_and_play(),
            table
                .lobby()
                .occupied()
                .all(|(_, seat)| seat.account.is_none()),
        )
    })
    .await;
    assert!(pass_and_play);
    assert!(no_account);
}

// Released accounts

#[tokio::test(start_paused = true)]
async fn a_released_account_loses_its_seats_and_tokens_everywhere() {
    let (registry, _) = registry();
    let (deleted, kept) = (Uuid::new_v4(), Uuid::new_v4());
    let ana = registry
        .create_private("Ana", Variant::Classic, Some(kept))
        .unwrap();
    let ben = registry
        .join(ana.code.as_deref().unwrap(), "Ben", Some(deleted))
        .await
        .unwrap();
    act(&registry, &ana, Action::Ready { ready: true })
        .await
        .unwrap();
    act(&registry, &ben, Action::Ready { ready: true })
        .await
        .unwrap();
    act(
        &registry,
        &ana,
        Action::Start {
            fill_with_bots: true,
        },
    )
    .await
    .unwrap();
    let waiting = registry
        .create_private("Ben", Variant::Classic, Some(deleted))
        .unwrap();
    let solo = registry
        .create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            Some(deleted),
        )
        .unwrap();

    registry.release_account(deleted).await;

    let seat = read(&registry, ana.table_id, |table| {
        table.lobby().seat(1).unwrap().clone()
    })
    .await;
    assert_eq!(seat.name, "Deleted player");
    assert_eq!(seat.connection, Connection::BotTakeover);
    assert!(registry.authorize(ben.table_id, &ben.player_token).is_err());
    assert!(registry.authorize(ana.table_id, &ana.player_token).is_ok());
    assert!(
        registry.handle(waiting.table_id).is_none(),
        "the table left empty is removed"
    );
    assert!(
        registry
            .authorize(solo.table_id, &solo.player_token)
            .is_err()
    );
}

// Reactions

#[tokio::test(start_paused = true)]
async fn seated_players_react_once_the_game_has_started() {
    let (registry, _) = registry();
    let ana = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let ben = registry
        .join(ana.code.as_deref().unwrap(), "Ben", None)
        .await
        .unwrap();
    let wow = Action::React {
        reaction: TableReaction::Wow,
    };
    assert_eq!(
        conflict(act(&registry, &ana, wow.clone()).await.unwrap_err()),
        "Reactions open once the game starts."
    );
    act(&registry, &ana, Action::Ready { ready: true })
        .await
        .unwrap();
    act(&registry, &ben, Action::Ready { ready: true })
        .await
        .unwrap();
    act(
        &registry,
        &ana,
        Action::Start {
            fill_with_bots: true,
        },
    )
    .await
    .unwrap();

    act(
        &registry,
        &ben,
        Action::React {
            reaction: TableReaction::WellPlayed,
        },
    )
    .await
    .unwrap();
    let now = registry.now();
    let recent = read(&registry, ana.table_id, move |table| table.reactions(now)).await;
    assert_eq!(recent.len(), 1);
    assert_eq!(recent[0].reaction, TableReaction::WellPlayed);
    assert_eq!(recent[0].position, 1);
}

#[tokio::test(start_paused = true)]
async fn a_panic_inside_a_table_closes_that_table_and_not_the_others() {
    let (registry, _) = registry();
    let broken = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let healthy = registry
        .create_private("Bob", Variant::Classic, None)
        .unwrap();
    let code = broken.code.clone().unwrap();

    // A bug inside the table: its task panics, and whoever waited for it is told the table is gone.
    let handle = registry.handle(broken.table_id).unwrap();
    let asked = handle.ask(|_| panic!("a bug inside the table")).await;
    assert!(matches!(asked, Err(AppError::NotFound)));
    settle().await;

    assert!(registry.handle(broken.table_id).is_none());
    assert!(registry.handle(healthy.table_id).is_some());
    assert!(matches!(
        registry.authorize(broken.table_id, &broken.player_token),
        Err(AppError::NotFound)
    ));
    assert!(matches!(
        act(&registry, &broken, Action::Ready { ready: true }).await,
        Err(AppError::NotFound)
    ));
    // Its invitation code is released with it, and the other table still plays.
    assert!(registry.join(&code, "Cy", None).await.is_err());
    assert_eq!(registry.counts(), (0, 1));
    act(&registry, &healthy, Action::Ready { ready: true })
        .await
        .unwrap();
}

#[tokio::test(start_paused = true)]
async fn a_shutdown_ends_every_table_task() {
    let (registry, _) = registry();
    let one = registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    registry.open_public("Bob", Variant::Classic, None).unwrap();
    let handle = registry.handle(one.table_id).unwrap();
    registry.shutdown().await;
    assert_eq!(
        registry.counts(),
        (0, 0),
        "the tables are gone with their tasks"
    );
    assert!(matches!(
        handle.ask(|table| table.version()).await,
        Err(AppError::NotFound)
    ));
}

#[tokio::test(start_paused = true)]
async fn the_counters_equal_a_scan_after_many_creations_and_removals() {
    let (registry, _) = registry();
    let check = |registry: &TableRegistry| {
        assert_eq!(registry.kind_counts(), registry.scanned_kind_counts());
        let [(_, local), (_, private), (_, public)] = registry.kind_counts();
        assert_eq!(registry.counts(), (local, private + public));
    };
    let mut ids = Vec::new();
    for round in 0..30 {
        let local = registry
            .create_local(
                Variant::Classic,
                Difficulty::Relaxed,
                LocalOptions::default(),
                None,
                None,
            )
            .unwrap();
        let private = registry
            .create_private("Ana", Variant::Classic, None)
            .unwrap();
        let public = registry.open_public("Bob", Variant::Classic, None).unwrap();
        ids.extend([local.table_id, private.table_id, public.table_id]);
        check(&registry);
        // Every third round, one table of each kind ends: by a removal, by its last player leaving, by a panic.
        if round % 3 == 0 {
            registry.remove(local.table_id);
            act(&registry, &public, Action::Leave).await.unwrap();
            let broken = registry.handle(private.table_id).unwrap();
            let _ = broken.ask(|_| panic!("a bug inside the table")).await;
            settle().await;
            check(&registry);
        }
    }
    assert_eq!(registry.counts(), (20, 40));
    for id in ids {
        registry.remove(id);
    }
    settle().await;
    check(&registry);
    assert_eq!(registry.counts(), (0, 0));
}

// The account index (US-184)

fn releases(registry: &TableRegistry, id: Uuid) -> usize {
    registry
        .handle(id)
        .unwrap()
        .releases
        .load(std::sync::atomic::Ordering::Relaxed)
}

#[tokio::test(start_paused = true)]
async fn the_index_follows_seats_taken_and_left_and_tables_removed() {
    let (registry, _) = registry();
    let (ana_account, ben_account) = (Uuid::new_v4(), Uuid::new_v4());
    let ana = registry
        .create_private("Ana", Variant::Classic, Some(ana_account))
        .unwrap();
    assert_eq!(registry.tables_of(ana_account), vec![ana.table_id]);
    assert!(registry.tables_of(ben_account).is_empty());

    let ben = registry
        .join(ana.code.as_deref().unwrap(), "Ben", Some(ben_account))
        .await
        .unwrap();
    assert_eq!(registry.tables_of(ben_account), vec![ana.table_id]);

    act(&registry, &ben, Action::Leave).await.unwrap();
    assert!(registry.tables_of(ben_account).is_empty());
    assert_eq!(registry.tables_of(ana_account), vec![ana.table_id]);

    let solo = registry
        .create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            Some(ana_account),
        )
        .unwrap();
    let mut held = registry.tables_of(ana_account);
    held.sort();
    let mut expected = vec![ana.table_id, solo.table_id];
    expected.sort();
    assert_eq!(held, expected);

    registry.remove(solo.table_id);
    registry.remove(ana.table_id);
    settle().await;
    assert!(registry.tables_of(ana_account).is_empty());
    assert_eq!(registry.accounts.accounts(), 0, "no empty entry is left");
}

#[tokio::test(start_paused = true)]
async fn releasing_an_account_asks_only_the_tables_where_it_sits() {
    let (registry, _) = registry();
    let (deleted, other) = (Uuid::new_v4(), Uuid::new_v4());
    let mine = registry
        .create_private("Ana", Variant::Classic, Some(deleted))
        .unwrap();
    let mut others = Vec::new();
    for _ in 0..30 {
        others.push(
            registry
                .create_private("Eve", Variant::Classic, Some(other))
                .unwrap(),
        );
    }
    registry
        .create_local(
            Variant::Classic,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            None,
        )
        .unwrap();

    registry.release_account(deleted).await;

    for access in &others {
        assert_eq!(releases(&registry, access.table_id), 0);
    }
    assert!(
        registry.handle(mine.table_id).is_none(),
        "the table left empty is removed"
    );
    assert!(registry.tables_of(deleted).is_empty());
}

// US-181: the caps are exact

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn parallel_creations_never_pass_the_caps() {
    let (registry, _) = registry_with(Limits {
        max_local_tables: 10,
        max_online_tables: 7,
        ..Limits::default()
    });
    let registry = Arc::new(registry);
    let mut attempts = Vec::new();
    for round in 0..200 {
        let registry = registry.clone();
        attempts.push(tokio::spawn(async move {
            if round % 2 == 0 {
                registry
                    .create_local(
                        Variant::Classic,
                        Difficulty::Relaxed,
                        LocalOptions::default(),
                        None,
                        None,
                    )
                    .map(|_| true)
            } else if round % 4 == 1 {
                registry
                    .create_private("Ann", Variant::Classic, None)
                    .map(|_| false)
            } else {
                registry
                    .open_public("Bob", Variant::Classic, None)
                    .map(|_| false)
            }
        }));
    }
    let (mut local, mut online) = (0, 0);
    for attempt in attempts {
        match attempt.await.unwrap() {
            Ok(true) => local += 1,
            Ok(false) => online += 1,
            Err(AppError::CapacityExceeded) => {}
            Err(other) => panic!("unexpected {other:?}"),
        }
    }
    assert_eq!((local, online), (10, 7), "exactly the caps are taken");
    assert_eq!(registry.counts(), (10, 7));
    assert_eq!(registry.kind_counts(), registry.scanned_kind_counts());
}

#[tokio::test(start_paused = true)]
async fn a_full_command_queue_is_refused_as_busy_and_recovers() {
    let (registry, _) = registry();
    let access = registry
        .create_private("Ann", Variant::Classic, None)
        .unwrap();
    let handle = registry.handle(access.table_id).unwrap();
    // The table's task does not run while this test does not yield: polling each ask once only queues it.
    let mut queued = 0;
    let mut context = std::task::Context::from_waker(std::task::Waker::noop());
    let refusal = loop {
        let mut ask = Box::pin(handle.ask(|_| ()));
        match ask.as_mut().poll(&mut context) {
            std::task::Poll::Pending => queued += 1,
            std::task::Poll::Ready(answer) => break answer,
        }
        assert!(queued <= 1000, "the queue never filled");
    };
    assert!(matches!(refusal, Err(AppError::CapacityExceeded)));
    assert!(queued <= task::COMMAND_QUEUE, "{queued} commands queued");
    settle().await;
    assert!(handle.ask(|_| ()).await.is_ok(), "the table answers again");
}

mod tutorial {
    //! Tutorial tables (US-199): coached, every hand face up, never saved.

    use std::sync::Mutex;

    use futures_util::future::BoxFuture;

    use super::*;
    use crate::api::{Viewer, snapshot};
    use crate::tables::Tutorial;
    use crate::tables::store::{Change, Stored, TableStore};

    async fn device_view(registry: &TableRegistry, id: Uuid) -> serde_json::Value {
        let now = registry.now();
        let view = read(registry, id, move |table| {
            snapshot(table, Viewer::Device, now)
        })
        .await;
        serde_json::to_value(view).unwrap()
    }

    #[tokio::test(start_paused = true)]
    async fn a_lesson_shows_every_hand_and_the_coach() {
        let (registry, _) = registry();
        let access = registry
            .create_tutorial(Tutorial::Lesson {
                id: "win-cheaply".into(),
            })
            .unwrap();
        let view = device_view(&registry, access.table_id).await;
        let hands = view["board"]["allHands"].as_array().expect("four hands");
        assert_eq!(hands.len(), 4);
        assert!(hands.iter().all(|hand| hand.as_array().unwrap().len() >= 7));
        let tutorial = &view["tutorial"];
        assert_eq!(tutorial["lesson"], "win-cheaply");
        assert_eq!(tutorial["lessonDone"], false);
        let coach = &tutorial["coach"];
        assert_eq!(coach["card"]["rank"], "J");
        assert_eq!(coach["card"]["suit"], "DIAMONDS");
        assert_eq!(coach["why"], "WIN_CHEAPLY");
        assert_eq!(coach["others"][0]["whyNot"], "TOO_STRONG");
        assert_eq!(coach["progress"]["number"], 2);
        assert_eq!(view["table"]["hints"], false);
    }

    #[tokio::test(start_paused = true)]
    async fn a_solo_table_shows_neither_the_hands_nor_a_coach() {
        let (registry, _) = registry();
        let access = registry
            .create_local(
                Variant::Classic,
                Difficulty::Relaxed,
                LocalOptions::default(),
                None,
                None,
            )
            .unwrap();
        let view = device_view(&registry, access.table_id).await;
        assert!(view.get("tutorial").is_none());
        if let Some(board) = view.get("board") {
            assert!(board.get("allHands").is_none());
        }
    }

    #[tokio::test(start_paused = true)]
    async fn an_unknown_lesson_is_not_found() {
        let (registry, _) = registry();
        let error = registry
            .create_tutorial(Tutorial::Lesson { id: "nope".into() })
            .unwrap_err();
        assert!(matches!(error, AppError::NotFound), "{error:?}");
    }

    #[tokio::test(start_paused = true)]
    async fn the_coach_refuses_another_card_through_the_registry() {
        let (registry, _) = registry();
        let access = registry
            .create_tutorial(Tutorial::Lesson {
                id: "win-cheaply".into(),
            })
            .unwrap();
        let wrong = Action::Card {
            rank: "A".into(),
            suit: beelot_game::Suit::Diamonds,
            declare: None,
        };
        let error = act(&registry, &access, wrong).await.unwrap_err();
        assert!(matches!(
            error,
            AppError::Conflict {
                code: "tutorial-card",
                ..
            }
        ));
    }

    #[derive(Default)]
    struct Recording(Mutex<Vec<Uuid>>);

    impl TableStore for Recording {
        fn save(&self, change: Change) -> BoxFuture<'_, ()> {
            Box::pin(async move { self.0.lock().unwrap().push(change.table) })
        }

        fn remove(&self, _table: Uuid) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }

        fn load_active(&self, _since: OffsetDateTime) -> BoxFuture<'_, Vec<Stored>> {
            Box::pin(async { Vec::new() })
        }
    }

    #[tokio::test(start_paused = true)]
    async fn a_tutorial_is_not_saved_but_a_solo_table_is() {
        let (registry, _) = registry();
        let store = Arc::new(Recording::default());
        registry.keep_in(store.clone()).await;
        let lesson = registry
            .create_tutorial(Tutorial::Lesson {
                id: "lead-trump".into(),
            })
            .unwrap();
        let solo = registry
            .create_local(
                Variant::Classic,
                Difficulty::Relaxed,
                LocalOptions::default(),
                None,
                None,
            )
            .unwrap();
        settle().await;
        registry.flush_saves().await;
        let saved = store.0.lock().unwrap().clone();
        assert!(saved.contains(&solo.table_id));
        assert!(!saved.contains(&lesson.table_id));
    }
}
