//! The analysis of a finished round: `GET /api/tables/{id}/analysis`.

use serde::Serialize;

use super::snapshot::CardView;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CostlyCardView {
    pub trick: usize,
    pub position: usize,
    pub played: CardView,
    pub best: CardView,
    pub points_lost: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisView {
    pub complete: bool,
    pub costly: Vec<CostlyCardView>,
}
