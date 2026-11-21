//! A table busy with its bots must not stall anyone who reads it. A strategy that waits on a barrier stands for a bot's
//! search: while it holds the table, the table route, the stream, the explanations and the hint still answer from what
//! the table published, and the (single-threaded) runtime still runs a short timer on time.

mod common;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Barrier};
use std::time::{Duration, Instant};

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use beelot_game::bidding::AuctionDecision;
use beelot_game::bot::BotStrategy;
use beelot_game::{Card, Difficulty, Variant};
use beelot_server::app::{AppState, router};
use beelot_server::config::Config;
use beelot_server::tables::registry::LocalOptions;
use beelot_server::tables::{Access, TableSetup};
use common::{call, get_request, json_request};
use serde_json::json;
use tower::ServiceExt;

/// A bot that, the first time it is asked to call, waits until the test lets it go; it passes every time.
struct Waiting {
    first: AtomicBool,
    asked: Arc<Barrier>,
    release: Arc<Barrier>,
}

impl BotStrategy for Waiting {
    fn decide_auction(&self, _: &beelot_game::bidding::AuctionView) -> AuctionDecision {
        if self.first.swap(false, Ordering::SeqCst) {
            self.asked.wait();
            self.release.wait();
        }
        AuctionDecision::Pass
    }

    fn choose_card(&self, view: &beelot_game::board::PlayView) -> Card {
        view.legal_cards[0]
    }
}

/// A bot that panics, as a bug inside a table would.
struct Broken;

impl BotStrategy for Broken {
    fn decide_auction(&self, _: &beelot_game::bidding::AuctionView) -> AuctionDecision {
        panic!("a bug inside the bot");
    }

    fn choose_card(&self, view: &beelot_game::board::PlayView) -> Card {
        view.legal_cards[0]
    }
}

fn state_with(strategy: &'static dyn BotStrategy) -> AppState {
    let (state, _) = common::state_with(Config::default());
    state.with_table_setup(move || TableSetup::seeded(11).with_strategy(strategy))
}

fn solo(state: &AppState) -> Access {
    state
        .registry
        .create_local(
            Variant::Classic,
            Difficulty::Challenging,
            LocalOptions::default(),
            None,
            None,
        )
        .unwrap()
}

/// Runs the request and returns the status, and how late a 20 ms timer fired meanwhile.
async fn timer_delay_during(app: Router, request: Request<Body>) -> (StatusCode, Duration) {
    let call = tokio::spawn(async move { app.oneshot(request).await.unwrap() });
    let start = Instant::now();
    tokio::time::sleep(Duration::from_millis(20)).await;
    let late = start.elapsed();
    (call.await.unwrap().status(), late)
}

#[tokio::test]
async fn reads_answer_while_a_bot_is_thinking() {
    let (asked, release) = (Arc::new(Barrier::new(2)), Arc::new(Barrier::new(2)));
    let waiting: &'static Waiting = Box::leak(Box::new(Waiting {
        first: AtomicBool::new(true),
        asked: asked.clone(),
        release: release.clone(),
    }));
    let state = state_with(waiting);
    let app = router(state.clone());
    let access = solo(&state);
    let id = access.table_id;
    let token = access.player_token.clone();

    // The human's first call is the dealer's turn at most; the bots' calls wait on the barrier.
    let acting = tokio::spawn({
        let app = app.clone();
        let (token, uri) = (token.clone(), format!("/api/tables/{id}/actions"));
        async move {
            call(
                &app,
                json_request("POST", &uri, Some(&token), json!({"type": "pass"})),
            )
            .await
        }
    });
    // Whoever the first bot is, wait until a bot is inside its strategy.
    let asked = tokio::task::spawn_blocking(move || asked.wait());
    tokio::time::timeout(Duration::from_secs(10), asked)
        .await
        .expect("a bot is asked")
        .unwrap();

    for uri in [
        format!("/api/tables/{id}"),
        format!("/api/tables/{id}/hint"),
        format!("/api/tables/{id}/explanations"),
        format!("/api/tables/{id}/events?token={token}"),
    ] {
        let (status, late) = timer_delay_during(app.clone(), get_request(&uri, Some(&token))).await;
        assert_ne!(status, StatusCode::INTERNAL_SERVER_ERROR, "{uri}");
        assert!(
            late < Duration::from_millis(300),
            "{uri} blocked the runtime for {late:?}"
        );
    }
    let (status, _) = call(
        &app,
        get_request(&format!("/api/tables/{id}"), Some(&token)),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "the table answers while its bot thinks"
    );

    tokio::task::spawn_blocking(move || release.wait())
        .await
        .unwrap();
    let (status, _) = acting.await.unwrap();
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_panicking_bot_closes_its_table_and_not_the_others() {
    let broken: &'static Broken = &Broken;
    let state = state_with(broken);
    let app = router(state.clone());
    let doomed = solo(&state);
    let fine = state
        .registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();

    let uri = format!("/api/tables/{}/actions", doomed.table_id);
    let (status, _) = call(
        &app,
        json_request(
            "POST",
            &uri,
            Some(&doomed.player_token),
            json!({"type": "pass"}),
        ),
    )
    .await;
    assert_ne!(status, StatusCode::OK, "the action that hit the bug fails");
    let table = format!("/api/tables/{}", doomed.table_id);
    let (status, _) = call(&app, get_request(&table, Some(&doomed.player_token))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "the table is closed");

    let table = format!("/api/tables/{}", fine.table_id);
    let (status, _) = call(&app, get_request(&table, Some(&fine.player_token))).await;
    assert_eq!(status, StatusCode::OK, "the other table goes on");
    assert_eq!(state.registry.counts(), (0, 1));
}
