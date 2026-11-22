//! The hint and the analysis are capped (US-173): a limit on the solves running at once, a stricter limit per client,
//! the analysis of a round computed once, and bots that keep playing while the solvers are full.

mod common;

use std::time::Duration;

use axum::Router;
use axum::http::StatusCode;
use beelot_game::bot::strategies;
use beelot_game::{Difficulty, Variant};
use beelot_server::app::{AppState, router};
use beelot_server::config::{Config, Limits};
use beelot_server::tables::TableSetup;
use beelot_server::tables::registry::LocalOptions;
use common::{call, get_request, json_request, state_with};
use serde_json::{Value, json};
use tower::ServiceExt;

struct Player {
    table: String,
    token: String,
}

fn app_with(limits: Limits) -> (Router, AppState) {
    let (state, _) = state_with(Config {
        limits,
        ..Config::default()
    });
    (router(state.clone()), state)
}

async fn solo(app: &Router) -> Player {
    let body = json!({"kind": "LOCAL", "variant": "CONTREE", "difficulty": "RELAXED"});
    let (status, created) = call(app, json_request("POST", "/api/tables", None, body)).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    Player {
        table: created["tableId"].as_str().unwrap().into(),
        token: created["playerToken"].as_str().unwrap().into(),
    }
}

async fn accepted(app: &Router, player: &Player, action: Value) -> Value {
    let uri = format!("/api/tables/{}/actions", player.table);
    let (status, body) = call(app, json_request("POST", &uri, Some(&player.token), action)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

/// A table in card play, where a hint is possible.
async fn card_play(app: &Router) -> (Player, Value) {
    let player = solo(app).await;
    let contract = json!({"type": "contract", "value": 160, "suit": "SPADES"});
    let mut view = accepted(app, &player, contract).await;
    while view["bidding"]["complete"] != true {
        view = accepted(app, &player, json!({"type": "pass"})).await;
    }
    (player, view)
}

/// A table whose round is over, where an analysis is possible.
async fn finished_round(app: &Router) -> Player {
    let (player, mut view) = card_play(app).await;
    for _ in 0..64 {
        if view["board"]["roundResult"].is_object() {
            break;
        }
        let action = if view["board"]["reviewingCompletedTrick"] == true {
            json!({"type": "continueTrick"})
        } else {
            let card = view["board"]["legalCards"][0].clone();
            json!({"type": "card", "rank": card["rank"], "suit": card["suit"], "declare": true})
        };
        view = accepted(app, &player, action).await;
    }
    assert!(view["board"]["roundResult"].is_object());
    player
}

async fn ask(app: &Router, player: &Player, route: &str) -> axum::response::Response {
    let uri = format!("/api/tables/{}/{route}", player.table);
    app.clone()
        .oneshot(get_request(&uri, Some(&player.token)))
        .await
        .unwrap()
}

async fn status_of(app: &Router, player: &Player, route: &str) -> (StatusCode, Value) {
    let uri = format!("/api/tables/{}/{route}", player.table);
    call(app, get_request(&uri, Some(&player.token))).await
}

fn one_at_a_time() -> Limits {
    Limits {
        max_concurrent_solves: 1,
        ..Limits::default()
    }
}

#[tokio::test]
async fn a_hint_over_the_solver_limit_is_busy_with_a_retry_after() {
    let (app, state) = app_with(one_at_a_time());
    let (player, _) = card_play(&app).await;
    let running = state.solvers.enter().expect("the one solve");

    let response = ask(&app, &player, "hint").await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(response.headers().contains_key("retry-after"));
    let body = common::body_bytes(response).await;
    let body: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(body["error"], "solver-busy");
    assert_eq!(body["code"], "solver-busy");

    drop(running);
    let (status, hint) = status_of(&app, &player, "hint").await;
    assert_eq!(status, StatusCode::OK, "{hint}");
}

#[tokio::test]
async fn an_analysis_over_the_solver_limit_is_busy() {
    let (app, state) = app_with(one_at_a_time());
    let player = finished_round(&app).await;
    let running = state.solvers.enter().unwrap();

    let (status, body) = status_of(&app, &player, "analysis").await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{body}");
    assert_eq!(body["error"], "solver-busy");

    drop(running);
    let (status, body) = status_of(&app, &player, "analysis").await;
    assert_eq!(status, StatusCode::OK, "{body}");
}

#[tokio::test]
async fn the_hint_and_the_analysis_have_a_stricter_limit_per_client() {
    let (app, _) = app_with(Limits {
        solves_per_window: 3,
        ..Limits::default()
    });
    let (player, _) = card_play(&app).await;
    for _ in 0..3 {
        let (status, body) = status_of(&app, &player, "hint").await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }
    let response = ask(&app, &player, "hint").await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(response.headers().contains_key("retry-after"));
    // The analysis shares the limit, and the other routes keep the general one.
    let (status, _) = status_of(&app, &player, "analysis").await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    let uri = format!("/api/tables/{}", player.table);
    let (status, _) = call(&app, get_request(&uri, Some(&player.token))).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn the_analysis_of_a_finished_round_is_computed_once() {
    let (app, state) = app_with(one_at_a_time());
    let player = finished_round(&app).await;
    let (status, first) = status_of(&app, &player, "analysis").await;
    assert_eq!(status, StatusCode::OK, "{first}");

    // With every solver taken, the same round is still answered, with the first answer: nothing is computed.
    let running = state.solvers.enter().unwrap();
    let (status, again) = status_of(&app, &player, "analysis").await;
    assert_eq!(status, StatusCode::OK, "{again}");
    assert_eq!(again, first);
    drop(running);

    // A later version of the table does not read it.
    let id = player.table.parse().unwrap();
    let handle = state.registry.handle(id).unwrap();
    let version = handle.published().version;
    assert!(handle.known_analysis(version).is_some());
    assert!(handle.known_analysis(version + 1).is_none());
}

#[tokio::test]
async fn a_challenging_table_plays_while_every_solver_is_taken() {
    let (mut state, _) = state_with(Config {
        limits: one_at_a_time(),
        ..Config::default()
    });
    state = state.with_table_setup(|| {
        TableSetup::seeded(11).with_strategy(strategies::for_difficulty(Difficulty::Challenging))
    });
    let app = router(state.clone());
    let _running = state.solvers.enter().unwrap();
    let access = state
        .registry
        .create_local(
            Variant::Classic,
            Difficulty::Challenging,
            LocalOptions::default(),
            None,
            None,
        )
        .unwrap();
    let player = Player {
        table: access.table_id.to_string(),
        token: access.player_token,
    };

    let play = async {
        let uri = format!("/api/tables/{}/actions", player.table);
        let pass = json_request("POST", &uri, Some(&player.token), json!({"type": "pass"}));
        call(&app, pass).await
    };
    let (status, body) = tokio::time::timeout(Duration::from_secs(30), play)
        .await
        .expect("the bots answer");
    assert_ne!(status, StatusCode::SERVICE_UNAVAILABLE, "{body}");
    assert_eq!(status, StatusCode::OK, "{body}");
}
