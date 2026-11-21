//! What a table's task publishes after each change: everything a read needs, built once, so that a read touches no lock and
//! never waits for the table's bots.

use beelot_game::Variant;
use beelot_table::reactions::KEPT_FOR;
use beelot_table::reactions::Reaction;
use time::OffsetDateTime;

use super::stream::Moments;
use super::{Actor, HintInput, ReviewInput, Status, Table, TableKind};
use crate::api::snapshot::ReactionView;
use crate::api::{Snapshot, Viewer, snapshot};
use crate::error::AppError;

/// What matchmaking, the metrics and the spectator limits read of a table.
#[derive(Debug, Clone)]
pub struct Summary {
    pub variant: Variant,
    pub status: Status,
    pub seated: usize,
    /// The seats a human occupies.
    pub humans: [bool; 4],
    pub bot_fill_at: Option<OffsetDateTime>,
    pub spectators_allowed: bool,
    pub watching: u32,
}

/// What a solo table's hint and review are computed from, taken when they can be asked.
#[derive(Debug, Clone)]
pub struct LocalReads {
    pub hint: Result<HintInput, beelot_table::Refusal>,
    pub review: Result<ReviewInput, beelot_table::Refusal>,
}

/// A table as of one version.
#[derive(Debug)]
pub struct Published {
    pub version: u64,
    pub summary: Summary,
    /// The snapshot each viewer gets, without reactions: those depend on the reader's clock.
    snapshots: Vec<(Viewer, Snapshot)>,
    reactions: Vec<Reaction>,
    local: Option<LocalReads>,
    moments: Moments,
    latest: u64,
}

impl Published {
    pub fn of(table: &Table) -> Self {
        // Reactions are filtered at read time: the snapshot is built as of when the table was changed.
        let at = table.last_activity();
        let viewers: Vec<Viewer> = if table.kind == TableKind::Local {
            vec![Viewer::Device]
        } else {
            (0..4)
                .map(Viewer::Seat)
                .chain([Viewer::Spectator])
                .collect()
        };
        let snapshots = viewers
            .into_iter()
            .map(|viewer| {
                let mut view = snapshot(table, viewer, at);
                view.reactions.clear();
                (viewer, view)
            })
            .collect();
        let lobby = table.lobby();
        let mut humans = [false; 4];
        for (position, seat) in lobby.occupied() {
            humans[position] = seat.kind == super::SeatKind::Human;
        }
        let local = (table.kind == TableKind::Local).then(|| LocalReads {
            hint: table.hint_input(Actor::Device),
            review: table.review_input(Actor::Device),
        });
        Self {
            version: table.version(),
            summary: Summary {
                variant: lobby.variant(),
                status: lobby.status(),
                seated: lobby.occupied().count(),
                humans,
                bot_fill_at: lobby.bot_fill_at(),
                spectators_allowed: lobby.spectators(),
                watching: table.watching(),
            },
            snapshots,
            reactions: table.kept_reactions(),
            local,
            moments: Moments::default(),
            latest: 0,
        }
    }

    /// With the moments the table has kept for its streams, the last numbered `latest`.
    pub fn with_moments(mut self, moments: Moments, latest: u64) -> Self {
        self.moments = moments;
        self.latest = latest;
        self
    }

    /// The moments kept for the streams, oldest first.
    pub fn moments(&self) -> &std::collections::VecDeque<std::sync::Arc<super::stream::Moment>> {
        &self.moments
    }

    /// The number of the last moment; 0 before any.
    pub fn latest_seq(&self) -> u64 {
        self.latest
    }

    /// What anyone sees of the table: a solo table's device view, or an online table's spectator view.
    pub fn public(&self) -> Option<&Snapshot> {
        self.snapshots
            .iter()
            .find(|(viewer, _)| matches!(viewer, Viewer::Device | Viewer::Spectator))
            .map(|(_, view)| view)
    }

    /// The table as `viewer` sees it at `now`: the stored snapshot with the reactions of the last 30 seconds.
    pub fn view(&self, viewer: Viewer, now: OffsetDateTime) -> Option<Snapshot> {
        let (_, stored) = self.snapshots.iter().find(|(held, _)| *held == viewer)?;
        let mut view = stored.clone();
        view.reactions = self
            .reactions
            .iter()
            .filter(|reaction| reaction.sent_at >= now - KEPT_FOR)
            .map(|reaction| ReactionView {
                sequence: reaction.sequence,
                position: reaction.position,
                reaction: reaction.reaction,
            })
            .collect();
        Some(view)
    }

    /// The input of the hint, which only a solo table gives.
    pub fn hint_input(&self) -> Result<HintInput, AppError> {
        match &self.local {
            Some(reads) => reads.hint.clone().map_err(AppError::from),
            None => Err(AppError::from(beelot_table::Refusal::NotFound)),
        }
    }

    /// The finished round of a solo table.
    pub fn review_input(&self) -> Result<ReviewInput, AppError> {
        match &self.local {
            Some(reads) => reads.review.clone().map_err(AppError::from),
            None => Err(AppError::from(beelot_table::Refusal::NotFound)),
        }
    }
}
