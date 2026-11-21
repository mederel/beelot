//! Tables kept through a restart (US-169), on MariaDB: a table restored after the server restarts answers its tokens and
//! shows the same table, a finished match is stored once with the last move, deleting an account clears the links of its
//! seats, and a log the server cannot read is dropped.

mod common;
#[path = "common/db.rs"]
mod db;

use std::sync::Arc;

use axum::Router;
use axum::http::StatusCode;
use beelot_game::bot::strategies;
use beelot_game::{Difficulty, Variant};
use beelot_server::app::{AppState, router};
use beelot_server::clock::{Clock, FakeClock};
use beelot_server::config::Config;
use beelot_server::db::accounts::{self, Account};
use beelot_server::db::tables::DbTableStore;
use beelot_server::privacy::{deletion, export, retention};
use beelot_server::tables::finished::{FinishedMatch, FinishedSeat, Mode};
use beelot_server::tables::registry::{Access, LocalOptions};
use beelot_server::tables::store::{Change, StoredEntry, TableStore};
use beelot_server::tables::{Connection, TableSetup};
use common::{call, get_request, json_request};
use serde_json::{Value, json};
use sqlx::MySqlPool;
use time::macros::datetime;
use uuid::Uuid;

/// A server on `pool`: the tables it opens are saved, and those saved before come back.
async fn server(pool: &MySqlPool, clock: &Arc<FakeClock>) -> (AppState, Router, usize) {
    let state = AppState::new(Config::default(), clock.clone())
        .with_table_setup(|| {
            TableSetup::seeded(11).with_strategy(strategies::for_difficulty(Difficulty::Relaxed))
        })
        .with_pool(pool.clone());
    let restored = state
        .registry
        .keep_in(Arc::new(DbTableStore::new(pool.clone())))
        .await;
    let app = router(state.clone());
    (state, app, restored)
}

fn clock() -> Arc<FakeClock> {
    Arc::new(FakeClock::new(datetime!(2026-10-24 12:00 UTC)))
}

async fn account(pool: &MySqlPool, name: &str) -> Uuid {
    let account = Account::new(Uuid::new_v4(), name.into(), datetime!(2026-10-24 12:00 UTC));
    accounts::insert(pool, &account).await.unwrap();
    account.id
}

async fn act(app: &Router, access: &Access, action: Value) -> Value {
    let uri = format!("/api/tables/{}/actions", access.table_id);
    let (status, body) = call(
        app,
        json_request("POST", &uri, Some(&access.player_token), action),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

async fn read(app: &Router, access: &Access) -> (StatusCode, Value) {
    let uri = format!("/api/tables/{}", access.table_id);
    call(app, get_request(&uri, Some(&access.player_token))).await
}

/// What a restart must keep of a snapshot: the seats, the auction, the cards and the score. The connections and the
/// version are not: nobody is connected after a restart.
fn kept(mut snapshot: Value) -> Value {
    snapshot["version"] = Value::Null;
    snapshot["moves"] = Value::Null;
    for seat in snapshot["table"]["seats"].as_array_mut().unwrap() {
        seat["connectionState"] = Value::Null;
    }
    snapshot["reactions"] = Value::Null;
    for seat in snapshot["table"]["seats"].as_array_mut().unwrap() {
        seat["connection"] = Value::Null;
    }
    snapshot
}

async fn count(pool: &MySqlPool, sql: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_owned()))
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn a_private_table_comes_back_with_its_tokens_its_code_and_its_cards() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, app, _) = server(&pool, &clock).await;
    let owner = state
        .registry
        .create_private("Ana", Variant::Contree, None)
        .unwrap();
    let code = owner.code.clone().unwrap();
    let ben = state.registry.join(&code, "Ben", None).await.unwrap();
    act(&app, &owner, json!({"type": "ready", "ready": true})).await;
    act(&app, &ben, json!({"type": "ready", "ready": true})).await;
    act(&app, &owner, json!({"type": "start", "fillWithBots": true})).await;
    let before = read(&app, &owner).await.1;
    let before_ben = read(&app, &ben).await.1;
    assert!(before["bidding"].is_object(), "the match is in its auction");
    state.registry.shutdown().await;

    let (restarted, app, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 1);
    let (status, after) = read(&app, &owner).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "the owner's token still acts: {after}"
    );
    assert_json_eq(&kept(after), &kept(before), "");
    assert_eq!(kept(read(&app, &ben).await.1), kept(before_ben));
    let (status, _) = call(
        &app,
        get_request(&format!("/api/tables/{}", owner.table_id), Some("forged")),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(restarted.registry.handle(owner.table_id).is_some());
    // Nobody is connected until a stream opens, and the takeover timer starts at the restart.
    let handle = restarted.registry.handle(owner.table_id).unwrap();
    let humans: Vec<Connection> = handle
        .ask(|table| {
            table
                .lobby()
                .occupied()
                .filter(|(_, seat)| seat.kind == beelot_server::tables::SeatKind::Human)
                .map(|(_, seat)| seat.connection)
                .collect()
        })
        .await
        .unwrap();
    assert_eq!(humans.len(), 2);
    for connection in humans {
        assert_eq!(connection, Connection::Disconnected { since: clock.now() });
    }
    // The game goes on where it was.
    act(&app, &owner, json!({"type": "pass"})).await;
}

#[tokio::test]
async fn a_waiting_private_table_is_joined_by_its_code_after_a_restart() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, _, _) = server(&pool, &clock).await;
    let owner = state
        .registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let code = owner.code.clone().unwrap();
    state.registry.shutdown().await;

    let (restarted, _, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 1);
    let ben = restarted.registry.join(&code, "Ben", None).await.unwrap();
    assert_eq!(ben.table_id, owner.table_id);
}

#[tokio::test]
async fn a_solo_table_comes_back_with_its_score_and_its_hand() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, app, _) = server(&pool, &clock).await;
    let solo = state
        .registry
        .create_local(
            Variant::Contree,
            Difficulty::Relaxed,
            LocalOptions::default(),
            None,
            None,
        )
        .unwrap();
    let mut view = read(&app, &solo).await.1;
    while view["bidding"]["complete"] != true {
        let action = if view["bidding"]["highestBid"] == 0 {
            json!({"type": "contract", "value": 80, "suit": "HEARTS"})
        } else {
            json!({"type": "pass"})
        };
        view = act(&app, &solo, action).await;
    }
    let card = view["board"]["legalCards"][0].clone();
    let before = act(
        &app,
        &solo,
        json!({"type": "card", "rank": card["rank"], "suit": card["suit"]}),
    )
    .await;
    state.registry.shutdown().await;

    let (_, app, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 1);
    let after = read(&app, &solo).await.1;
    assert_eq!(kept(after), kept(before));
}

fn finished(account: Uuid) -> FinishedMatch {
    FinishedMatch {
        id: Uuid::new_v4(),
        ended_at: datetime!(2026-10-24 13:00 UTC),
        mode: Mode::Solo,
        variant: Variant::Contree,
        difficulty: Some(Difficulty::Relaxed),
        north_south_score: 1010,
        east_west_score: 640,
        winning_team: beelot_game::Team::NorthSouth,
        announcements: true,
        all_trumps: true,
        target: 1000,
        undos: 0,
        seats: (0..4)
            .map(|seat| FinishedSeat {
                account: (seat == 0).then_some(account),
                name: format!("Seat {seat}"),
                bot: seat != 0,
            })
            .collect(),
        rounds: Vec::new(),
    }
}

fn change_with(table: Uuid, finished: Vec<FinishedMatch>) -> Change {
    Change {
        table,
        origin: Some(r#"{"id":"x"}"#.into()),
        from: Some(0),
        entries: vec![StoredEntry {
            seq: 0,
            version: 1,
            at: datetime!(2026-10-24 12:00 UTC),
            event: r#"{"type":"botsFilled"}"#.into(),
        }],
        last_activity: Some(datetime!(2026-10-24 12:00 UTC)),
        tokens: None,
        links: Vec::new(),
        finished,
    }
}

#[tokio::test]
async fn a_finished_match_is_stored_once_with_the_last_move() {
    let pool = db::test_pool().await;
    let player = account(&pool, "Lucky Otter").await;
    let store = DbTableStore::new(pool.clone());
    let table = Uuid::new_v4();
    let finished = finished(player);

    store.save(change_with(table, vec![finished.clone()])).await;
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM table_event").await, 1);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM match_record").await, 1);

    // The same change again, as after a retry: still one match, and the events are not doubled.
    store.save(change_with(table, vec![finished])).await;
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM table_event").await, 1);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM match_record").await, 1);
}

#[tokio::test]
async fn a_write_that_fails_leaves_nothing_of_its_change() {
    let pool = db::test_pool().await;
    let store = DbTableStore::new(pool.clone());
    let table = Uuid::new_v4();
    let mut change = change_with(table, Vec::new());
    // An origin that is not text the database accepts as is: here, a hole in the events.
    change.from = Some(3);
    store.save(change).await;
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM table_event").await, 0);
}

#[tokio::test]
async fn deleting_an_account_clears_the_links_of_its_seats() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, _, _) = server(&pool, &clock).await;
    let player = account(&pool, "Lucky Otter").await;
    let other = account(&pool, "Quick Fox").await;
    let table = state
        .registry
        .create_private("Lucky Otter", Variant::Classic, Some(player))
        .unwrap();
    let code = table.code.clone().unwrap();
    state
        .registry
        .join(&code, "Quick Fox", Some(other))
        .await
        .unwrap();
    state.registry.flush_saves().await;
    assert_eq!(
        count(&pool, "SELECT COUNT(*) FROM table_seat_link").await,
        2
    );
    let saved: String = sqlx::query_scalar("SELECT origin FROM saved_table")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(
        !saved.contains(&player.to_string()),
        "the origin names no account: {saved}"
    );
    let events: Vec<String> = sqlx::query_scalar("SELECT event FROM table_event")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(
        events.iter().all(
            |event| !event.contains(&player.to_string()) && !event.contains(&other.to_string())
        ),
        "no event names an account: {events:?}"
    );
    // The export lists the table the account sits at.
    let exported = export::export(&pool, &state.events, player, None, clock.now())
        .await
        .unwrap()
        .unwrap();
    let export::Export::Ready(exported) = exported else {
        panic!("the export is ready");
    };
    assert_eq!(exported.saved_tables.len(), 1);
    assert_eq!(exported.saved_tables[0].table_id, table.table_id);

    // The statement the deletion runs: the table is restored with the seat, and no account on it.
    sqlx::query("DELETE FROM table_seat_link WHERE account_id = ?")
        .bind(player.hyphenated())
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        count(&pool, "SELECT COUNT(*) FROM table_seat_link").await,
        1,
        "only the other player's link is left"
    );
    state.registry.shutdown().await;

    let (restarted, _, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 1);
    let handle = restarted.registry.handle(table.table_id).unwrap();
    let accounts: Vec<Option<Uuid>> = handle
        .ask(|table| {
            table
                .lobby()
                .occupied()
                .map(|(_, seat)| seat.account)
                .collect()
        })
        .await
        .unwrap();
    assert_eq!(accounts, [None, Some(other)]);
}

#[tokio::test]
async fn deleting_an_account_runs_the_clearing_of_its_links() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, _, _) = server(&pool, &clock).await;
    let player = account(&pool, "Lucky Otter").await;
    let table = state
        .registry
        .create_private("Lucky Otter", Variant::Classic, Some(player))
        .unwrap();
    state.registry.flush_saves().await;
    assert_eq!(
        count(&pool, "SELECT COUNT(*) FROM table_seat_link").await,
        1
    );
    deletion::delete(&state, player, None).await.unwrap();
    assert_eq!(
        count(&pool, "SELECT COUNT(*) FROM table_seat_link").await,
        0
    );
    state.registry.shutdown().await;
    // The owner left the waiting table with the account, so the table was removed and nothing of it is saved.
    let (restarted, _, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 0);
    assert!(restarted.registry.handle(table.table_id).is_none());
}

#[tokio::test]
async fn a_log_of_an_unknown_format_is_dropped_and_the_others_come_back() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, _, _) = server(&pool, &clock).await;
    let good = state
        .registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let bad = state
        .registry
        .create_private("Ben", Variant::Classic, None)
        .unwrap();
    state.registry.shutdown().await;
    sqlx::query("UPDATE saved_table SET format = 99 WHERE table_id = ?")
        .bind(bad.table_id.hyphenated())
        .execute(&pool)
        .await
        .unwrap();

    let (restarted, _, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 1);
    assert!(
        restarted.registry.handle(good.table_id).is_some(),
        "good {} bad {} flags {:?}",
        good.table_id,
        bad.table_id,
        sqlx::query_as::<_, (String, i16)>(
            "SELECT CAST(table_id AS CHAR), format FROM saved_table"
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    );
    assert!(restarted.registry.handle(bad.table_id).is_none());
    restarted.registry.flush_saves().await;
    let rows: Vec<(String, i16)> =
        sqlx::query_as("SELECT CAST(table_id AS CHAR), format FROM saved_table")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        rows,
        [(good.table_id.to_string(), 1)],
        "bad is {}",
        bad.table_id
    );
}

#[tokio::test]
async fn a_log_the_events_cannot_replay_is_dropped() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, _, _) = server(&pool, &clock).await;
    let table = state
        .registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    state
        .registry
        .join(&table.code.clone().unwrap(), "Ben", None)
        .await
        .unwrap();
    state.registry.shutdown().await;
    sqlx::query("UPDATE table_event SET event = '{\"type\":\"nothingKnown\"}' WHERE seq = 0")
        .execute(&pool)
        .await
        .unwrap();

    let (restarted, _, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 0);
    assert!(restarted.registry.handle(table.table_id).is_none());
}

#[tokio::test]
async fn a_table_that_ends_deletes_its_saved_events() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, app, _) = server(&pool, &clock).await;
    let table = state
        .registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    state.registry.flush_saves().await;
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM saved_table").await, 1);
    assert!(count(&pool, "SELECT COUNT(*) FROM table_token").await >= 1);

    act(&app, &table, json!({"type": "leave"})).await;
    state.registry.flush_saves().await;
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM saved_table").await, 0);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM table_event").await, 0);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM table_token").await, 0);
}

#[tokio::test]
async fn the_nightly_job_deletes_tables_idle_for_two_hours() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, _, _) = server(&pool, &clock).await;
    let old = state
        .registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    state.registry.shutdown().await;
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM saved_table").await, 1);

    clock.advance(time::Duration::hours(2) + time::Duration::minutes(1));
    retention::run(&state, clock.now()).await;
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM saved_table").await, 0);
    // And a server that starts now restores nothing.
    let (restarted, _, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 0);
    assert!(restarted.registry.handle(old.table_id).is_none());
}

#[tokio::test]
async fn only_the_tables_active_in_the_last_two_hours_come_back() {
    let pool = db::test_pool().await;
    let clock = clock();
    let (state, _, _) = server(&pool, &clock).await;
    let table = state
        .registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    state.registry.shutdown().await;

    clock.advance(time::Duration::hours(2) + time::Duration::minutes(1));
    let (restarted, _, restored) = server(&pool, &clock).await;
    assert_eq!(restored, 0);
    assert!(restarted.registry.handle(table.table_id).is_none());
}

/// Like `assert_eq!`, but names the first path that differs.
fn assert_json_eq(left: &Value, right: &Value, path: &str) {
    match (left, right) {
        (Value::Object(a), Value::Object(b)) => {
            for key in a.keys().chain(b.keys()) {
                assert_json_eq(
                    a.get(key).unwrap_or(&Value::Null),
                    b.get(key).unwrap_or(&Value::Null),
                    &format!("{path}/{key}"),
                );
            }
        }
        (Value::Array(a), Value::Array(b)) if a.len() == b.len() => {
            for (index, (a, b)) in a.iter().zip(b).enumerate() {
                assert_json_eq(a, b, &format!("{path}/{index}"));
            }
        }
        _ => assert_eq!(left, right, "at {path}"),
    }
}
