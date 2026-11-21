//! The background jobs: expired sessions every hour and the retention purge every night at 03:30 UTC (the tables keep
//! their own deadlines, see `tables::task`). A failed iteration is logged and the loop goes on; every
//! loop stops on the cancellation token.

use std::future::Future;
use std::time::Duration;

use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::app::AppState;
use crate::auth::sessions;
use crate::privacy::retention;

pub fn spawn_all(state: AppState, cancel: CancellationToken) -> Vec<JoinHandle<()>> {
    let expiring = state.clone();
    let retaining = state;
    vec![
        every(Duration::from_secs(3600), cancel.clone(), move || {
            let state = expiring.clone();
            async move {
                if let Err(error) = sessions::sweep_expired(&state.pool, state.clock.now()).await {
                    tracing::warn!(%error, "could not end the expired sessions");
                }
            }
        }),
        tokio::spawn(async move {
            loop {
                let now = retaining.clock.now();
                let wait = (retention::next_run(now) - now).unsigned_abs();
                tokio::select! {
                    () = cancel.cancelled() => return,
                    () = tokio::time::sleep(wait) => retention::run(&retaining, retaining.clock.now()).await,
                }
            }
        }),
    ]
}

fn every<F, Fut>(period: Duration, cancel: CancellationToken, mut job: F) -> JoinHandle<()>
where
    F: FnMut() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send,
{
    tokio::spawn(async move {
        let mut ticks = tokio::time::interval(period);
        ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        ticks.tick().await;
        loop {
            tokio::select! {
                () = cancel.cancelled() => return,
                _ = ticks.tick() => job().await,
            }
        }
    })
}
