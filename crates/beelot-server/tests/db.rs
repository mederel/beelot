//! The schema and the account repository, on MariaDB.

#[path = "common/db.rs"]
mod db;

use beelot_server::db::accounts::{self, Account};
use beelot_server::db::events;
use time::Duration;
use time::macros::datetime;
use uuid::Uuid;

#[tokio::test]
async fn migrations_apply_and_account_round_trips() {
    let pool = db::test_pool().await;
    let created = datetime!(2026-10-24 12:00:00.123456 UTC);
    let account = Account::new(Uuid::new_v4(), "Lucky Otter".into(), created);
    accounts::insert(&pool, &account).await.unwrap();
    assert_eq!(
        accounts::find(&pool, account.id).await.unwrap(),
        Some(account.clone())
    );

    let later = created + Duration::days(2);
    accounts::record_sign_in(&pool, account.id, later)
        .await
        .unwrap();
    let found = accounts::find(&pool, account.id).await.unwrap().unwrap();
    assert_eq!(
        found.last_sign_in_at, later,
        "only the last sign-in is kept (US-129)"
    );

    let latest = later + Duration::hours(1);
    accounts::record_sign_in(&pool, account.id, latest)
        .await
        .unwrap();
    let found = accounts::find(&pool, account.id).await.unwrap().unwrap();
    assert_eq!(found.last_sign_in_at, latest);

    events::insert(
        &pool,
        "SIGN_IN",
        "SUCCESS",
        Some(account.id),
        "10.0.0.1".parse().ok(),
        latest,
    )
    .await
    .unwrap();
    let stored: Option<String> = sqlx::query_scalar("SELECT ip_token FROM security_event")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        stored,
        Some(beelot_server::privacy::tokens::ip_token(
            "10.0.0.1".parse().unwrap()
        )),
        "a security event keeps the token of the address, not the address"
    );
    assert!(accounts::delete(&pool, account.id).await.unwrap());
    assert_eq!(accounts::find(&pool, account.id).await.unwrap(), None);
    assert!(!accounts::delete(&pool, account.id).await.unwrap());
}

#[tokio::test]
async fn names_keep_their_accents() {
    let pool = db::test_pool().await;
    let account = Account::new(
        Uuid::new_v4(),
        "Chloé Brûlée".into(),
        datetime!(2026-10-24 12:00 UTC),
    );
    accounts::insert(&pool, &account).await.unwrap();
    assert_eq!(
        accounts::find(&pool, account.id)
            .await
            .unwrap()
            .unwrap()
            .display_name,
        "Chloé Brûlée"
    );
}

#[tokio::test]
async fn a_daily_attempt_is_claimed_once_scored_once_and_ranked() {
    use beelot_server::db::daily;
    use time::macros::date;

    let pool = db::test_pool().await;
    let day = date!(2026 - 11 - 13);
    let created = datetime!(2026-10-24 12:00:00 UTC);
    let (first, second) = (Uuid::new_v4(), Uuid::new_v4());
    for (account, name) in [(first, "Lucky Otter"), (second, "Calm Heron")] {
        accounts::insert(&pool, &Account::new(account, name.into(), created))
            .await
            .unwrap();
    }
    assert!(daily::claim(&pool, day, first).await.unwrap());
    assert!(!daily::claim(&pool, day, first).await.unwrap(), "one attempt a day");
    assert_eq!(daily::attempt(&pool, day, first).await.unwrap(), Some(None));
    assert_eq!(daily::attempt(&pool, day, second).await.unwrap(), None);

    daily::record(&pool, day, first, 120).await.unwrap();
    daily::record(&pool, day, first, 999).await.unwrap();
    assert_eq!(daily::attempt(&pool, day, first).await.unwrap(), Some(Some(120)));

    assert!(daily::claim(&pool, day, second).await.unwrap());
    daily::record(&pool, day, second, 150).await.unwrap();
    let board = daily::top(&pool, day).await.unwrap();
    assert_eq!(
        board.iter().map(|entry| entry.score).collect::<Vec<_>>(),
        vec![150, 120]
    );
    assert_eq!(board[0].name, "Calm Heron");
    assert_eq!(daily::listed_above(&pool, day, 120).await.unwrap(), 1);
    assert!(daily::top(&pool, day.next_day().unwrap()).await.unwrap().is_empty());
}
