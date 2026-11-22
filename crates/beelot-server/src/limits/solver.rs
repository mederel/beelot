//! How many hints and analyses may run at once (US-173): each one is a search that holds a core, so the server runs at
//! most `max_concurrent_solves` of them and refuses the rest as busy, rather than letting them crowd out the bots.

use std::sync::Arc;

use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct SolverGate {
    permits: Arc<Semaphore>,
}

impl SolverGate {
    pub fn new(max: usize) -> Self {
        Self {
            permits: Arc::new(Semaphore::new(max.max(1))),
        }
    }

    /// The right to run one solve, held until it ends; `SolverBusy` when every one is taken.
    pub fn enter(&self) -> Result<OwnedSemaphorePermit, AppError> {
        self.permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| AppError::SolverBusy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solves_beyond_the_limit_are_refused_and_a_finished_one_makes_room() {
        let gate = SolverGate::new(2);
        let first = gate.enter().unwrap();
        let _second = gate.enter().unwrap();
        assert!(matches!(gate.enter(), Err(AppError::SolverBusy)));
        drop(first);
        assert!(gate.enter().is_ok());
    }
}
