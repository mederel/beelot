//! US-172: what saving 1,000 changes of 100 tables costs in queries and in time, on MariaDB.
//!
//! The figures are printed (CI runs this test with `--nocapture`). Before the story each change cost at least 5 statements
//! (begin, upsert of the table, count of its events, one insert per event, commit), plus a delete and an insert per token
//! and one per link; the bound below is what the new writes must stay under.

#[path = "common/db.rs"]
mod db;

use std::time::Instant;

use beelot_server::db::tables::DbTableStore;
use beelot_server::tables::store::{Change, StoredEntry, TableStore};
use sqlx::MySqlPool;
use time::macros::datetime;
use uuid::Uuid;

const TABLES: usize = 100;
const CHANGES_PER_TABLE: usize = 10;

/// The server's count of the statements it has run so far.
async fn questions(pool: &MySqlPool) -> u64 {
    let (_, value): (String, String) = sqlx::query_as("SHOW GLOBAL STATUS LIKE 'Questions'")
        .fetch_one(pool)
        .await
        .unwrap();
    value.parse().unwrap()
}

/// The `index`-th change of a table: one event, the table's origin, its two links, and four tokens in the first.
fn change(table: Uuid, index: usize, links: &[(Uuid, Uuid)]) -> Change {
    Change {
        table,
        origin: Some(r#"{"id":"x"}"#.into()),
        from: Some(index),
        entries: vec![StoredEntry {
            seq: index,
            version: index as u64 + 1,
            at: datetime!(2026-10-24 12:00 UTC),
            event: r#"{"type":"botsFilled"}"#.into(),
        }],
        last_activity: Some(datetime!(2026-10-24 12:00 UTC)),
        tokens: (index == 0).then(|| {
            (0..4)
                .map(|seat| {
                    (
                        format!("{:064x}", seat + table.as_u128() % 1000),
                        format!("seat:{seat}"),
                    )
                })
                .collect()
        }),
        links: links.to_vec(),
        finished: Vec::new(),
    }
}

#[tokio::test]
async fn saving_a_thousand_changes_of_a_hundred_tables_costs_few_queries() {
    let pool = db::test_pool().await;
    let store = DbTableStore::new(pool.clone());
    let tables: Vec<(Uuid, Vec<(Uuid, Uuid)>)> = (0..TABLES)
        .map(|_| {
            (
                Uuid::new_v4(),
                vec![
                    (Uuid::new_v4(), Uuid::new_v4()),
                    (Uuid::new_v4(), Uuid::new_v4()),
                ],
            )
        })
        .collect();

    let before = questions(&pool).await;
    let started = Instant::now();
    for index in 0..CHANGES_PER_TABLE {
        for (table, links) in &tables {
            store.save(change(*table, index, links)).await;
        }
    }
    let elapsed = started.elapsed();
    let queries = questions(&pool).await - before - 1; // the reading of the counter itself

    let changes = (TABLES * CHANGES_PER_TABLE) as u64;
    println!(
        "US-172 figures: {changes} changes of {TABLES} tables: {queries} queries ({:.2} per change), {} ms",
        queries as f64 / changes as f64,
        elapsed.as_millis()
    );

    let events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM table_event")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(events as u64, changes, "every event is saved once");
    let tokens: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM table_token")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(tokens as usize, TABLES * 4);
    // Begin, update, insert and commit for a change, and a few more for the first change of a table and for the
    // statements each connection prepares once. Before the story: at least 7 per change, 7,000 or more in all.
    let bound = changes * 4 + TABLES as u64 * 8;
    assert!(queries <= bound, "{queries} queries, over {bound}");

    // A restart reads the tables with a few queries; before the story, three per table (301 for these).
    let restarted = DbTableStore::new(pool.clone());
    let before = questions(&pool).await;
    let started = Instant::now();
    let stored = restarted.load_active(datetime!(2026-10-24 00:00 UTC)).await;
    let elapsed = started.elapsed();
    let read = questions(&pool).await - before - 1;
    println!(
        "US-172 figures: reading {} saved tables: {read} queries, {} ms",
        stored.len(),
        elapsed.as_millis()
    );
    assert_eq!(stored.len(), TABLES);
    assert!(
        stored
            .iter()
            .all(|one| one.entries.len() == CHANGES_PER_TABLE)
    );
    assert!(read <= 12, "{read} queries to read {TABLES} tables");
}
