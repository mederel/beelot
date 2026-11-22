//! The leaderboard, on MariaDB (US-182): its index, its cache of the top and the exact rank of the player.

mod common;
#[path = "common/db.rs"]
mod db;

use axum::body::Body;
use axum::http::{Request, header};
use beelot_server::app::router;
use beelot_server::auth::sessions;
use beelot_server::clock::Clock;
use beelot_server::config::Config;
use beelot_server::db::accounts::{self, Account};
use beelot_server::db::ratings::{self, MIN_MATCHES};
use common::{body_json, state_with};
use serde_json::Value;
use sqlx::MySqlPool;
use tower::ServiceExt;
use uuid::Uuid;

async fn rated(pool: &MySqlPool, name: &str, rating: f64, matches: i32) -> Uuid {
    let account = Account::new(Uuid::new_v4(), name.into(), time::OffsetDateTime::now_utc());
    accounts::insert(pool, &account).await.unwrap();
    sqlx::query(
        "INSERT INTO rating (account_id, variant, rating, deviation, volatility, matches, updated_at) \
         VALUES (?, 'CLASSIC', ?, 100, 0.06, ?, NOW(6))",
    )
    .bind(account.id.hyphenated().to_string())
    .bind(rating)
    .bind(matches)
    .execute(pool)
    .await
    .unwrap();
    account.id
}

/// The `key` column of each row of `EXPLAIN` of a statement of the leaderboard.
async fn keys(pool: &MySqlPool, explained: &str) -> Vec<Option<String>> {
    use sqlx::Row;
    let sql = format!("EXPLAIN {explained}");
    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind("CLASSIC")
        .bind(MIN_MATCHES);
    query = if explained.contains("LIMIT") {
        query.bind(50_i64)
    } else {
        query.bind(1500.0_f64)
    };
    let rows = query.fetch_all(pool).await.unwrap();
    rows.iter().map(|row| row.get("key")).collect()
}

#[tokio::test]
async fn both_queries_use_the_leaderboard_index() {
    let pool = db::test_pool().await;
    for index in 0..300 {
        rated(
            &pool,
            &format!("Player {index}"),
            1000.0 + f64::from(index),
            12,
        )
        .await;
    }
    sqlx::query(sqlx::AssertSqlSafe("ANALYZE TABLE rating".to_string()))
        .fetch_all(&pool)
        .await
        .unwrap();
    for statement in [ratings::TOP_SQL, ratings::LISTED_ABOVE_SQL] {
        let used = keys(&pool, statement).await;
        println!("EXPLAIN {statement}\n{used:?}");
        assert!(
            used.iter().flatten().any(|key| key == "rating_board_idx"),
            "{statement} does not use the index: {used:?}"
        );
    }
}

async fn board(app: &axum::Router, session: Option<&str>) -> Value {
    let mut request = Request::get("/api/leaderboard?variant=CLASSIC");
    if let Some(session) = session {
        request = request.header(header::COOKIE, format!("BEELOT_SESSION={session}"));
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap();
    body_json(response).await
}

#[tokio::test]
async fn the_top_is_read_once_and_the_players_own_rank_stays_exact() {
    let pool = db::test_pool().await;
    let (state, clock) = state_with(Config::default());
    let state = state.with_pool(pool.clone());
    let app = router(state.clone());
    rated(&pool, "Ana", 1600.0, 20).await;
    let me = rated(&pool, "Me", 1500.0, 20).await;
    let session = sessions::start(&pool, me, clock.now()).await.unwrap();

    let first = board(&app, Some(&session)).await;
    assert_eq!(first["rows"].as_array().unwrap().len(), 2);
    assert_eq!(first["mine"]["rank"], 2);

    rated(&pool, "Ben", 1700.0, 20).await;
    let second = board(&app, Some(&session)).await;
    assert_eq!(
        second["rows"], first["rows"],
        "the top is served from the cache, not read again"
    );
    assert_eq!(second["mine"]["rank"], 3, "the player's own rank is exact");

    state.leaderboards.invalidate("CLASSIC");
    let third = board(&app, Some(&session)).await;
    assert_eq!(third["rows"].as_array().unwrap().len(), 3);
}
