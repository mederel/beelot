//! The event streams of a token and of a table are bounded, and what a change sends is made once (US-174).

mod common;

use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use beelot_server::app::{AppState, router};
use beelot_server::error::AppError;
use beelot_server::tables::stream::messages;
use beelot_server::tables::task::{MAX_STREAMS_PER_TABLE, STREAMS_PER_TOKEN};
use beelot_server::tables::{Actor, TableHandle};
use common::{call, json_request, test_state_with_clock};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

struct Player {
    table: String,
    token: String,
}

fn app() -> (Router, AppState) {
    let (state, _) = test_state_with_clock();
    (router(state.clone()), state)
}

async fn private(app: &Router) -> Player {
    let body = json!({"kind": "PRIVATE", "variant": "CONTREE", "playerName": "Ana"});
    let (status, created) = call(app, json_request("POST", "/api/tables", None, body)).await;
    assert_eq!(status, StatusCode::CREATED);
    Player {
        table: created["tableId"].as_str().unwrap().into(),
        token: created["playerToken"].as_str().unwrap().into(),
    }
}

async fn open(app: &Router, player: &Player, query: &str) -> Body {
    let uri = format!("/api/tables/{}/events{query}", player.table);
    let response = app
        .clone()
        .oneshot(
            Request::get(uri)
                .header("authorization", format!("Bearer {}", player.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response.into_body()
}

/// Reads until a frame with data arrives; `None` when the stream has ended.
async fn frame(body: &mut Body) -> Option<String> {
    loop {
        let frame = tokio::time::timeout(Duration::from_secs(5), body.frame())
            .await
            .expect("a frame or the end within 5 s")?
            .unwrap();
        if let Ok(bytes) = frame.into_data() {
            return Some(String::from_utf8(bytes.to_vec()).unwrap());
        }
    }
}

async fn wait_until(mut done: impl FnMut() -> bool, what: &str) {
    for _ in 0..400 {
        if done() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    panic!("never happened: {what}");
}

#[tokio::test]
async fn a_token_over_its_streams_loses_the_oldest_and_the_seat_stays_present() {
    let (app, state) = app();
    let player = private(&app).await;
    let id: Uuid = player.table.parse().unwrap();
    let handle = state.registry.handle(id).unwrap();

    let mut streams = Vec::new();
    for _ in 0..STREAMS_PER_TOKEN {
        let mut body = open(&app, &player, "").await;
        assert!(frame(&mut body).await.is_some());
        streams.push(body);
    }
    assert_eq!(handle.streams_open(), STREAMS_PER_TOKEN);

    // One more: the first ends, the others and the new one stay, and the seat counts one stream per open one.
    let mut newest = open(&app, &player, "").await;
    assert!(frame(&mut newest).await.is_some());
    assert!(
        frame(&mut streams[0]).await.is_none(),
        "the oldest stream is closed"
    );
    drop(streams.remove(0));
    wait_until(
        || handle.open_streams()[0] as usize == STREAMS_PER_TOKEN,
        "the seat counts its open streams",
    )
    .await;
    assert_eq!(handle.streams_open(), STREAMS_PER_TOKEN);
    let seat = handle.published().summary.humans;
    assert!(seat[0], "the seat is still the player's");

    // The streams that are left are the live ones: a change reaches the newest.
    let uri = format!("/api/tables/{}/actions", player.table);
    let ready = json_request(
        "POST",
        &uri,
        Some(&player.token),
        json!({"type": "ready", "ready": true}),
    );
    let (status, _) = call(&app, ready).await;
    assert_eq!(status, StatusCode::OK);
    assert!(frame(&mut newest).await.is_some());
}

#[tokio::test]
async fn another_tokens_streams_are_not_closed() {
    let (app, state) = app();
    let first = private(&app).await;
    let handle = state.registry.handle(first.table.parse().unwrap()).unwrap();
    let mut other = open(&app, &first, "").await;
    assert!(frame(&mut other).await.is_some());

    // A spectator token of the same table fills its own streams without touching the player's.
    let owner = |name: &str| TableHandle::owner_of(name);
    let leases: Vec<_> = (0..STREAMS_PER_TOKEN + 3)
        .map(|_| handle.open_stream(owner("a spectator")).unwrap())
        .collect();
    assert_eq!(leases.len(), STREAMS_PER_TOKEN + 3);
    assert_eq!(
        handle.streams_open(),
        STREAMS_PER_TOKEN + 1,
        "four spectator streams and the player's"
    );
    assert!(leases[0].closed().is_cancelled());
    assert!(!leases.last().unwrap().closed().is_cancelled());
}

#[tokio::test]
async fn a_table_has_a_bounded_number_of_streams() {
    let (app, state) = app();
    let player = private(&app).await;
    let handle = state
        .registry
        .handle(player.table.parse().unwrap())
        .unwrap();
    let mut leases = Vec::new();
    for index in 0..MAX_STREAMS_PER_TABLE {
        let lease = handle
            .open_stream(TableHandle::owner_of(&format!("token {index}")))
            .unwrap();
        leases.push(lease);
    }
    assert!(matches!(
        handle.open_stream(TableHandle::owner_of("one more")),
        Err(AppError::CapacityExceeded)
    ));
    // The refusal reaches a client as the usual busy answer, and a place freed is a place again.
    let uri = format!("/api/tables/{}/events", player.table);
    let refused = app
        .clone()
        .oneshot(
            Request::get(&uri)
                .header("authorization", format!("Bearer {}", player.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(refused.status(), StatusCode::SERVICE_UNAVAILABLE);
    leases.pop();
    assert!(
        handle
            .open_stream(TableHandle::owner_of("one more"))
            .is_ok()
    );
}

#[tokio::test]
async fn a_change_is_serialized_once_per_viewer_for_all_the_streams() {
    let (app, state) = app();
    let player = private(&app).await;
    let handle = state
        .registry
        .handle(player.table.parse().unwrap())
        .unwrap();

    // Four streams of the same seat, as ten could be: each reads the same published version.
    let mut streams = Vec::new();
    for _ in 0..STREAMS_PER_TOKEN {
        let mut body = open(&app, &player, "?events=1").await;
        assert!(frame(&mut body).await.is_some());
        streams.push(body);
    }
    let before = handle.published();
    assert_eq!(before.built(), 1, "the first snapshot was made once");

    let uri = format!("/api/tables/{}/actions", player.table);
    let ready = json_request(
        "POST",
        &uri,
        Some(&player.token),
        json!({"type": "ready", "ready": true}),
    );
    assert_eq!(call(&app, ready).await.0, StatusCode::OK);
    for body in &mut streams {
        assert!(frame(body).await.is_some(), "every stream is told");
    }
    let after = handle.published();
    assert!(after.version > before.version);
    assert_eq!(after.built(), 1, "the change was serialized once");

    // The same holds when asked directly, with ten readers: one build, the same messages.
    let now = state.clock.now();
    let viewer = beelot_server::tables::registry::viewer_of(Actor::Seat(0));
    let cursor = Some(after.latest_seq());
    let first = messages(&after, viewer, now, cursor);
    for _ in 0..10 {
        let again = messages(&after, viewer, now, cursor);
        assert!(std::sync::Arc::ptr_eq(&first, &again));
    }
    assert!(after.built() <= 2, "one more for the new cursor at most");
}

#[tokio::test]
async fn the_versions_of_a_table_share_one_log_of_moments() {
    let (app, state) = app();
    let player = private(&app).await;
    let handle = state
        .registry
        .handle(player.table.parse().unwrap())
        .unwrap();
    let uri = format!("/api/tables/{}/actions", player.table);
    let change = |ready: bool| {
        json_request(
            "POST",
            &uri,
            Some(&player.token),
            json!({"type": "ready", "ready": ready}),
        )
    };
    assert_eq!(call(&app, change(true)).await.0, StatusCode::OK);
    let before = handle.published();
    assert_eq!(call(&app, change(false)).await.0, StatusCode::OK);
    let after = handle.published();
    assert!(after.version > before.version);
    assert!(
        std::ptr::eq(before.moments(), after.moments()),
        "a change appends to the log, it does not copy it"
    );
    assert!(!after.moments().is_empty());
}
