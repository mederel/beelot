//! The numbered event stream (US-168): a stream sends a snapshot when it opens and then one event per change, each with
//! its number as the SSE `id`; a client that comes back with `lastEventId` gets what it missed.

mod common;

use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use beelot_server::app::router;
use common::{call, get_request, json_request, test_state};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

struct Player {
    table: String,
    token: String,
}

async fn private(app: &Router, variant: &str) -> (Player, String) {
    let body = json!({"kind": "PRIVATE", "variant": variant, "playerName": "Ana"});
    let (status, created) = call(app, json_request("POST", "/api/tables", None, body)).await;
    assert_eq!(status, StatusCode::CREATED);
    (
        Player {
            table: created["tableId"].as_str().unwrap().into(),
            token: created["playerToken"].as_str().unwrap().into(),
        },
        created["code"].as_str().unwrap().into(),
    )
}

async fn join(app: &Router, code: &str, name: &str) -> Player {
    let body = json!({"code": code, "playerName": name});
    let (_, joined) = call(app, json_request("POST", "/api/tables/join", None, body)).await;
    Player {
        table: joined["tableId"].as_str().unwrap().into(),
        token: joined["playerToken"].as_str().unwrap().into(),
    }
}

async fn act(app: &Router, player: &Player, action: Value) -> Value {
    let uri = format!("/api/tables/{}/actions", player.table);
    let (status, body) = call(
        app,
        json_request("POST", &uri, Some(&player.token), action.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body} for {action}");
    body
}

async fn fresh(app: &Router, player: &Player) -> Value {
    let uri = format!("/api/tables/{}", player.table);
    call(app, get_request(&uri, Some(&player.token))).await.1
}

/// A message of the stream: its event name, its `id` and its JSON.
#[derive(Debug)]
struct Message {
    name: String,
    id: Option<u64>,
    data: Value,
}

async fn open(app: &Router, player: &Player, query: &str) -> Body {
    let uri = format!("/api/tables/{}/events?{query}", player.table);
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

/// Reads the next message of the stream, or none when nothing comes within `wait`.
async fn next(body: &mut Body, text: &mut String, wait: Duration) -> Option<Message> {
    loop {
        if let Some(end) = text.find("\n\n") {
            let raw: String = text.drain(..end + 2).collect();
            let (mut name, mut id, mut data) = (String::from("message"), None, String::new());
            for line in raw.lines() {
                if let Some(value) = line.strip_prefix("event:") {
                    name = value.trim().into();
                } else if let Some(value) = line.strip_prefix("id:") {
                    id = value.trim().parse().ok();
                } else if let Some(value) = line.strip_prefix("data:") {
                    data.push_str(value.trim_start());
                }
            }
            if data.is_empty() {
                continue;
            }
            return Some(Message {
                name,
                id,
                data: serde_json::from_str(&data).unwrap(),
            });
        }
        let frame = tokio::time::timeout(wait, body.frame()).await.ok()??.ok()?;
        if let Ok(bytes) = frame.into_data() {
            text.push_str(std::str::from_utf8(&bytes).unwrap());
        }
    }
}

const WAIT: Duration = Duration::from_secs(5);
const QUIET: Duration = Duration::from_millis(300);

#[tokio::test]
async fn a_new_stream_sends_a_snapshot_with_the_number_of_the_last_event() {
    let app = router(test_state());
    let (owner, code) = private(&app, "CLASSIC").await;
    let mut stream = open(&app, &owner, "events=1").await;
    let mut text = String::new();
    let first = next(&mut stream, &mut text, WAIT).await.unwrap();
    assert_eq!(first.name, "snapshot");
    assert!(first.id.is_some());
    assert_eq!(first.data["you"], 0);

    join(&app, &code, "Ben").await;
    let joined = next(&mut stream, &mut text, WAIT).await.unwrap();
    assert_eq!(joined.name, "event");
    assert_eq!(joined.id, Some(first.id.unwrap() + 1));
    assert_eq!(joined.data["type"], "joined");
    assert_eq!(joined.data["seq"], joined.id.unwrap());
    assert!(
        joined.data["state"]["table"]["seats"]
            .as_array()
            .unwrap()
            .len()
            == 2
    );
    assert!(joined.data.get("account").is_none());
}

/// The snapshot-per-change stream is gone (US-179): a stream opened without `events=1` is the numbered one.
#[tokio::test]
async fn there_is_one_stream_and_it_is_numbered() {
    let app = router(test_state());
    let (owner, code) = private(&app, "CLASSIC").await;
    let mut stream = open(&app, &owner, "x=1").await;
    let mut text = String::new();
    let first = next(&mut stream, &mut text, WAIT).await.unwrap();
    assert_eq!(first.name, "snapshot");
    assert!(first.id.is_some());
    join(&app, &code, "Ben").await;
    let second = next(&mut stream, &mut text, WAIT).await.unwrap();
    assert_eq!(
        second.name, "event",
        "a change is an event, not a new snapshot"
    );
    assert!(second.id.is_some());
}

/// Starts a Contrée match with bots, the owner bidding until the cards are played.
async fn play_some(app: &Router, owner: &Player) {
    act(app, owner, json!({"type": "ready", "ready": true})).await;
    let mut view = act(app, owner, json!({"type": "start", "fillWithBots": true})).await;
    while view["bidding"]["complete"] != true {
        let action = if view["bidding"]["highestBid"] == 0 {
            json!({"type": "contract", "value": 80, "suit": "HEARTS"})
        } else {
            json!({"type": "pass"})
        };
        view = act(app, owner, action).await;
    }
    while view["board"]["reviewingCompletedTrick"] != true {
        let card = view["board"]["legalCards"][0].clone();
        view = act(
            app,
            owner,
            json!({"type": "card", "rank": card["rank"], "suit": card["suit"]}),
        )
        .await;
    }
}

#[tokio::test]
async fn a_gap_of_any_length_rebuilds_the_table_a_fresh_snapshot_gives() {
    let app = router(test_state());
    let (owner, _) = private(&app, "CONTREE").await;
    let mut stream = open(&app, &owner, "events=1").await;
    let mut text = String::new();
    let first = next(&mut stream, &mut text, WAIT).await.unwrap();
    let mut last = first.id.unwrap();
    drop(stream);

    // Many moves while no stream is open.
    play_some(&app, &owner).await;

    let mut stream = open(&app, &owner, &format!("events=1&lastEventId={last}")).await;
    let mut text = String::new();
    let mut received = Vec::new();
    while let Some(message) = next(&mut stream, &mut text, QUIET).await {
        assert_eq!(message.name, "event");
        assert_eq!(
            message.id,
            Some(last + 1),
            "the events come in order, none skipped"
        );
        last += 1;
        received.push(message);
    }
    assert!(received.len() > 10, "{} events", received.len());
    let kinds: Vec<&str> = received
        .iter()
        .map(|m| m.data["type"].as_str().unwrap())
        .collect();
    for kind in ["deal", "call", "card"] {
        assert!(kinds.contains(&kind), "{kind} in {kinds:?}");
    }
    // Only the last event carries the state, and it is the table a fresh read gives.
    let with_state: Vec<usize> = received
        .iter()
        .enumerate()
        .filter(|(_, m)| m.data.get("state").is_some())
        .map(|(index, _)| index)
        .collect();
    assert_eq!(with_state, [received.len() - 1]);
    let mut state = received.last().unwrap().data["state"].clone();
    let mut now = fresh(&app, &owner).await;
    // The reactions are read at the moment of the read.
    state["reactions"] = json!([]);
    now["reactions"] = json!([]);
    assert_eq!(state, now);
}

#[tokio::test]
async fn a_number_the_table_no_longer_holds_gets_a_fresh_snapshot() {
    let app = router(test_state());
    let (owner, _) = private(&app, "CLASSIC").await;
    let mut text = String::new();
    let mut stream = open(&app, &owner, "events=1&lastEventId=999999").await;
    let message = next(&mut stream, &mut text, WAIT).await.unwrap();
    assert_eq!(message.name, "snapshot");
    assert_eq!(message.data["tableId"], owner.table);
}

#[tokio::test]
async fn nobody_is_sent_the_cards_of_another_seat() {
    let app = router(test_state());
    let (owner, code) = private(&app, "CONTREE").await;
    let ben = join(&app, &code, "Ben").await;
    let mut watching = Vec::new();
    for player in [&owner, &ben] {
        watching.push((player, open(&app, player, "events=1").await, String::new()));
    }
    for (_, stream, text) in &mut watching {
        next(stream, text, WAIT).await.unwrap();
    }
    act(&app, &owner, json!({"type": "ready", "ready": true})).await;
    act(&app, &ben, json!({"type": "ready", "ready": true})).await;
    let mut view = act(&app, &owner, json!({"type": "start", "fillWithBots": true})).await;
    // Both humans bid until the auction is over, so the bots and the deal produce events.
    let mut turns = 0;
    while view["bidding"]["complete"] != true && turns < 40 {
        turns += 1;
        for player in [&owner, &ben] {
            let uri = format!("/api/tables/{}/actions", player.table);
            let (status, body) = call(
                &app,
                json_request("POST", &uri, Some(&player.token), json!({"type": "pass"})),
            )
            .await;
            if status == StatusCode::OK {
                view = body;
            }
        }
    }
    for (player, stream, text) in &mut watching {
        let own = fresh(&app, player).await;
        let own_hand = own["bidding"]["dealt"].clone();
        let mut deals = 0;
        while let Some(message) = next(stream, text, QUIET).await {
            let raw = message.data.to_string();
            assert!(!raw.contains("seed"), "no seed in {raw}");
            assert!(!raw.contains("account"), "no account in {raw}");
            if message.name == "event" && message.data["type"] == "deal" {
                deals += 1;
                assert_eq!(
                    message.data["hand"], own_hand,
                    "a deal gives a seat its own cards"
                );
            } else if message.name == "event" {
                assert!(message.data.get("hand").is_none(), "{raw}");
            }
        }
        assert!(deals >= 1, "the deal reached the seat");
    }
}
