//! A database URL that does not parse stops the server the same way everywhere (US-190).

use std::sync::Arc;

use beelot_server::app::AppState;
use beelot_server::clock::SystemClock;
use beelot_server::config::Config;

fn state_error() -> anyhow::Error {
    match AppState::new(bad(), Arc::new(SystemClock)) {
        Ok(_) => panic!("an error, not the default options"),
        Err(error) => error,
    }
}

fn bad() -> Config {
    Config {
        database_url: "not a url".into(),
        ..Config::default()
    }
}

#[tokio::test]
async fn the_state_refuses_a_url_that_does_not_parse_and_names_the_variable() {
    let error = state_error();
    assert!(
        format!("{error:#}").contains("BEELOT_DATABASE_URL"),
        "{error:#}"
    );
}

#[tokio::test]
async fn connect_refuses_it_with_the_same_message() {
    let from_connect = beelot_server::db::connect(&bad())
        .await
        .map(|_| ())
        .expect_err("an error");
    let from_state = state_error();
    assert_eq!(format!("{from_connect:#}"), format!("{from_state:#}"));
}

#[tokio::test]
async fn a_url_that_parses_gives_a_state() {
    assert!(AppState::new(Config::default(), Arc::new(SystemClock)).is_ok());
}
