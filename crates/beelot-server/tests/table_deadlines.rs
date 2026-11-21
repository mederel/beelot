//! A table keeps its own deadlines: bots fill a public table after a minute, and a table nobody uses for two hours
//! removes itself. The clock and tokio's paused time move together.

mod common;

use beelot_game::Variant;
use beelot_server::app::AppState;
use beelot_server::tables::Status;
use common::{advance, test_state_with_clock};

async fn status(state: &AppState, id: uuid::Uuid) -> Status {
    state
        .registry
        .handle(id)
        .unwrap()
        .ask(|table| table.lobby().status())
        .await
        .unwrap()
}

#[tokio::test(start_paused = true)]
async fn bots_fill_a_public_table_after_a_minute_and_not_before() {
    let (state, clock) = test_state_with_clock();
    let public = state
        .registry
        .quick_match("Ana", Variant::Classic, None)
        .await
        .unwrap();

    advance(&clock, time::Duration::seconds(59)).await;
    assert_eq!(
        status(&state, public.table_id).await,
        Status::WaitingForPlayers
    );
    advance(&clock, time::Duration::seconds(1)).await;
    assert_eq!(
        status(&state, public.table_id).await,
        Status::InProgress,
        "bots took the empty seats"
    );
}

#[tokio::test(start_paused = true)]
async fn an_idle_table_removes_itself_after_two_hours_and_a_read_postpones_it() {
    let (state, clock) = test_state_with_clock();
    let idle = state
        .registry
        .create_private("Ana", Variant::Classic, None)
        .unwrap();
    let used = state
        .registry
        .create_private("Bob", Variant::Classic, None)
        .unwrap();

    advance(&clock, time::Duration::minutes(90)).await;
    // A read of the table counts as use.
    state
        .registry
        .authorize(used.table_id, &used.player_token)
        .unwrap();
    advance(&clock, time::Duration::minutes(29)).await;
    assert!(state.registry.handle(idle.table_id).is_some());
    advance(&clock, time::Duration::minutes(1)).await;
    assert!(
        state.registry.handle(idle.table_id).is_none(),
        "the idle table is gone at two hours"
    );
    assert!(state.registry.handle(used.table_id).is_some());
    advance(&clock, time::Duration::minutes(90)).await;
    assert!(state.registry.handle(used.table_id).is_none());
    assert_eq!(state.registry.counts(), (0, 0));
}
