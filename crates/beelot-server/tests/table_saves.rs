//! US-172: the saved rows after the cheaper writes, and the read of the saved tables in a few queries, on MariaDB.

#[path = "common/db.rs"]
mod db;

use beelot_server::db::accounts::{self, Account};
use beelot_server::db::tables::DbTableStore;
use beelot_server::tables::store::{Change, StoredEntry, TableStore};
use sqlx::MySqlPool;
use time::macros::datetime;
use uuid::Uuid;

fn entry(seq: usize, event: &str) -> StoredEntry {
    StoredEntry {
        seq,
        version: seq as u64 + 1,
        at: datetime!(2026-10-24 12:00 UTC),
        event: event.into(),
    }
}

fn change(table: Uuid, from: usize, events: &[&str]) -> Change {
    Change {
        table,
        origin: Some(r#"{"id":"x"}"#.into()),
        from: Some(from),
        entries: events
            .iter()
            .enumerate()
            .map(|(index, event)| entry(from + index, event))
            .collect(),
        last_activity: Some(datetime!(2026-10-24 12:00 UTC)),
        tokens: None,
        links: Vec::new(),
        finished: Vec::new(),
    }
}

fn tokens(rows: &[(&str, &str)]) -> Option<Vec<(String, String)>> {
    Some(
        rows.iter()
            .map(|(hash, actor)| (format!("{hash:0>64}"), (*actor).to_owned()))
            .collect(),
    )
}

async fn token_rows(pool: &MySqlPool) -> Vec<(String, String)> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT token_hash, actor FROM table_token ORDER BY token_hash")
            .fetch_all(pool)
            .await
            .unwrap();
    rows.into_iter()
        .map(|(hash, actor)| (hash.trim_start_matches('0').to_owned(), actor))
        .collect()
}

async fn event_rows(pool: &MySqlPool, table: Uuid) -> Vec<(i32, String)> {
    sqlx::query_as("SELECT seq, event FROM table_event WHERE table_id = ? ORDER BY seq")
        .bind(table.hyphenated())
        .fetch_all(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn the_events_of_a_change_are_saved_in_order_and_an_earlier_start_replaces_them() {
    let pool = db::test_pool().await;
    let store = DbTableStore::new(pool.clone());
    let table = Uuid::new_v4();
    store.save(change(table, 0, &["a", "b", "c"])).await;
    store.save(change(table, 3, &["d"])).await;
    assert_eq!(event_rows(&pool, table).await.len(), 4);
    // An undo: the log goes back to two events and continues differently.
    store.save(change(table, 2, &["c2"])).await;
    let rows = event_rows(&pool, table).await;
    let events: Vec<&str> = rows.iter().map(|(_, event)| event.as_str()).collect();
    assert_eq!(events, ["a", "b", "c2"]);
}

#[tokio::test]
async fn tokens_are_written_as_a_difference() {
    let pool = db::test_pool().await;
    let store = DbTableStore::new(pool.clone());
    let table = Uuid::new_v4();
    let mut first = change(table, 0, &["a"]);
    first.tokens = tokens(&[("a1", "seat:0"), ("b2", "seat:1"), ("c3", "device")]);
    store.save(first).await;
    assert_eq!(token_rows(&pool).await.len(), 3);

    // One token gone, one with another actor, one new.
    let mut second = change(table, 1, &["b"]);
    second.tokens = tokens(&[("b2", "seat:2"), ("c3", "device"), ("d4", "spectator")]);
    store.save(second).await;
    assert_eq!(
        token_rows(&pool).await,
        [
            ("b2".to_owned(), "seat:2".to_owned()),
            ("c3".to_owned(), "device".to_owned()),
            ("d4".to_owned(), "spectator".to_owned()),
        ]
    );

    // A change of the tokens alone, as when a token is issued.
    let mut alone = change(table, 0, &[]);
    alone.origin = None;
    alone.from = None;
    alone.last_activity = None;
    alone.tokens = tokens(&[("c3", "device")]);
    store.save(alone).await;
    assert_eq!(token_rows(&pool).await.len(), 1);
}

#[tokio::test]
async fn the_saved_tables_are_read_in_a_few_queries_and_saving_goes_on_from_them() {
    let pool = db::test_pool().await;
    let account = Account::new(
        Uuid::new_v4(),
        "Lucky Otter".into(),
        datetime!(2026-10-24 12:00 UTC),
    );
    accounts::insert(&pool, &account).await.unwrap();
    let store = DbTableStore::new(pool.clone());
    let tables: Vec<Uuid> = (0..30).map(|_| Uuid::new_v4()).collect();
    let link = Uuid::new_v4();
    for (index, table) in tables.iter().enumerate() {
        let mut first = change(*table, 0, &["a", "b"]);
        first.tokens = tokens(&[("a1", "seat:0"), ("b2", "device")]);
        if index == 0 {
            first.links = vec![(link, account.id)];
        }
        store.save(first).await;
    }

    // A restart: a store that holds nothing reads them back.
    let restarted = DbTableStore::new(pool.clone());
    let mut stored = restarted.load_active(datetime!(2026-10-24 00:00 UTC)).await;
    assert_eq!(stored.len(), 30);
    stored.sort_by_key(|stored| tables.iter().position(|table| *table == stored.id));
    for one in &stored {
        assert_eq!(one.entries.len(), 2);
        assert_eq!(one.entries[1].event, "b");
        assert_eq!(one.tokens.len(), 2);
        assert_eq!(one.format, 1);
        assert_eq!(one.origin, r#"{"id":"x"}"#);
    }
    assert_eq!(stored[0].links, vec![(link, account.id)]);
    assert!(stored[1].links.is_empty());

    // The restarted store goes on from what it read.
    restarted.save(change(tables[1], 2, &["c"])).await;
    assert_eq!(event_rows(&pool, tables[1]).await.len(), 3);
    assert_eq!(event_rows(&pool, tables[2]).await.len(), 2);
}

#[tokio::test]
async fn a_removed_table_is_saved_again_from_scratch() {
    let pool = db::test_pool().await;
    let store = DbTableStore::new(pool.clone());
    let table = Uuid::new_v4();
    store.save(change(table, 0, &["a", "b"])).await;
    store.remove(table).await;
    assert!(event_rows(&pool, table).await.is_empty());
    store.save(change(table, 0, &["z"])).await;
    assert_eq!(event_rows(&pool, table).await.len(), 1);
}
