//! What a daily round leaves for the board of the day (US-150).

use time::Date;
use uuid::Uuid;

/// What a finished daily round hands over: the day, the signed-in player and the points their team scored in the round.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DailyResult {
    pub day: Date,
    pub account: Uuid,
    pub score: i32,
}
