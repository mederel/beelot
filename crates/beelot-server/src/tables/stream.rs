//! The events of a table as its streams send them (US-168, ADR-006 step 5).
//!
//! The table's task records what each change did as [`Moment`]s, numbered in order, and keeps the last few hundred. A stream
//! opened sends a `snapshot` when it opens and then one `event` per moment, each with its number as the SSE
//! `id`; the last event of a batch also carries `state`, the table as the receiving seat sees it, so a client that applies
//! the events of any gap ends with the table a fresh snapshot would give. A moment is public except a deal, which gives a
//! seat its own cards only.

use std::collections::VecDeque;
use std::sync::Arc;

use beelot_game::bidding::{AuctionDecision, CallType, SeatCall};
use beelot_game::{Team, Trump};
use serde_json::{Value, json};
use time::OffsetDateTime;

use super::published::Published;
use super::{Event, Table};
use crate::api::{Snapshot, Viewer};

/// How many moments a table keeps for the streams that come back after a gap.
pub const KEPT_MOMENTS: usize = 400;

/// One thing that happened at a table, public as stored.
#[derive(Debug)]
pub struct Moment {
    pub seq: u64,
    pub version: u64,
    body: Value,
    /// A deal: each seat is given its own cards, so they are not in the body.
    deal: bool,
}

impl Moment {
    /// The body's `type`, for the tests and the counts.
    pub fn kind(&self) -> &str {
        self.body["type"].as_str().unwrap_or_default()
    }

    /// The moment as `viewer` receives it: the deal carries the viewer's own cards.
    fn json_for(&self, view: &Snapshot) -> Value {
        let mut body = self.body.clone();
        let object = body.as_object_mut().expect("a moment is an object");
        object.insert("seq".into(), json!(self.seq));
        object.insert("version".into(), json!(self.version));
        if self.deal {
            let hand = view.bidding.as_ref().map(|bidding| &bidding.dealt);
            object.insert(
                "hand".into(),
                serde_json::to_value(hand).expect("cards serialize"),
            );
        }
        body
    }
}

/// The moments a table has kept, oldest first, shared with the readers.
pub type Moments = Arc<VecDeque<Arc<Moment>>>;

/// Turns each change of a table into moments, and keeps the recent ones.
#[derive(Debug)]
pub struct Recorder {
    seen: usize,
    next: u64,
    kept: VecDeque<Arc<Moment>>,
    previous: Option<Snapshot>,
}

impl Recorder {
    /// Starts at the table as it is: what happened before is not replayed, a stream opens with a snapshot.
    pub fn new(table: &Table, published: &Published) -> Self {
        Self {
            seen: table.entries().len(),
            next: 1,
            kept: VecDeque::new(),
            previous: published.public().cloned(),
        }
    }

    /// The number of the last moment recorded; 0 before any.
    pub fn latest(&self) -> u64 {
        self.next - 1
    }

    pub fn moments(&self) -> Moments {
        Arc::new(self.kept.clone())
    }

    /// Records what the table's last change did.
    pub fn record(&mut self, table: &Table, published: &Published) {
        let version = table.version();
        let entries = &table.entries()[self.seen.min(table.entries().len())..];
        self.seen = table.entries().len();
        let name = |seat: usize| {
            table
                .lobby()
                .seat(seat)
                .map(|seat| seat.name.clone())
                .unwrap_or_default()
        };
        let mut found: Vec<(Value, bool)> = entries
            .iter()
            .filter_map(|entry| body_of(&entry.event, &name))
            .collect();
        let public = published.public();
        let deal = found.iter().any(|(_, deal)| *deal);
        found.extend(
            derived(self.previous.as_ref(), public, deal)
                .into_iter()
                .map(|body| (body, false)),
        );
        if found.is_empty() {
            found.push((json!({"type": "changed"}), false));
        }
        for (body, deal) in found {
            self.kept.push_back(Arc::new(Moment {
                seq: self.next,
                version,
                body,
                deal,
            }));
            self.next += 1;
        }
        while self.kept.len() > KEPT_MOMENTS {
            self.kept.pop_front();
        }
        self.previous = public.cloned();
    }
}

/// The moment an event of the table makes, or none; the second value is true for a deal. Nothing private is kept: the
/// seeds, the accounts and the match ids stay out, and a deal is told without its cards.
fn body_of(event: &Event, name: &impl Fn(usize) -> String) -> Option<(Value, bool)> {
    match event {
        Event::Dealt { dealer, .. } => Some((json!({"type": "deal", "dealer": dealer}), true)),
        Event::Called { seat, decision, .. } => {
            let call = super::messages::call_label(&call_of(*seat, *decision));
            Some((
                json!({
                    "type": "call",
                    "seat": seat,
                    "player": name(*seat),
                    "call": call.english(),
                    "callCode": call.coded(),
                    "coinche": *decision == AuctionDecision::Coinche,
                }),
                false,
            ))
        }
        Event::CardPlayed {
            seat,
            card,
            declare,
            ..
        } => Some((
            json!({
                "type": "card",
                "seat": seat,
                "player": name(*seat),
                "card": crate::api::snapshot::CardView::from(*card),
                "declare": declare,
            }),
            false,
        )),
        other => {
            let mut body = serde_json::to_value(other).expect("an event serializes");
            let object = body.as_object_mut().expect("an event is an object");
            for private in ["account", "seed", "matchId"] {
                object.remove(private);
            }
            Some((body, false))
        }
    }
}

fn call_of(seat: usize, decision: AuctionDecision) -> SeatCall {
    let (r#type, value, trump) = match decision {
        AuctionDecision::Pass => (CallType::Pass, 0, None),
        AuctionDecision::Bid { value, trump } => (CallType::Bid, value, Some(trump)),
        AuctionDecision::Coinche => (CallType::Coinche, 0, None),
        AuctionDecision::Trump { suit } => (CallType::Trump, 0, Some(Trump::from(suit))),
    };
    SeatCall {
        seat,
        r#type,
        value,
        trump,
    }
}

/// What the public view says happened beyond the table's own events: a trick shown with its winner, a round scored, a match
/// won. A new deal starts them again.
fn derived(previous: Option<&Snapshot>, now: Option<&Snapshot>, dealt: bool) -> Vec<Value> {
    let (Some(now), Some(board)) = (now, now.and_then(|now| now.board.as_ref())) else {
        return Vec::new();
    };
    let before = if dealt { None } else { previous };
    let before_board = before.and_then(|before| before.board.as_ref());
    let mut found = Vec::new();
    let newly_shown = board.reviewing_completed_trick
        && before_board.is_none_or(|old| {
            !old.reviewing_completed_trick || old.completed_tricks != board.completed_tricks
        });
    if newly_shown {
        let seat = board
            .seats
            .iter()
            .position(|seat| seat.name == board.trick_winner);
        found.push(json!({
            "type": "trick",
            "seat": seat,
            "winner": board.trick_winner,
            "points": board.trick_points,
        }));
    }
    if let Some(result) = &board.round_result
        && before_board.is_none_or(|old| old.round_result.is_none())
    {
        found.push(json!({
            "type": "round",
            "team": board.declaring_team,
            "made": result.contract_made,
            "capot": result.capot_team.is_some(),
        }));
        if let Some(winner) = now
            .r#match
            .as_ref()
            .filter(|score| score.complete)
            .and_then(|score| score.winner)
        {
            found.push(json!({"type": "match", "winner": team_text(winner)}));
        }
    }
    found
}

fn team_text(team: Team) -> Value {
    serde_json::to_value(team).expect("a team serializes")
}

/// A message of a stream: the SSE event name, its `id` and its JSON.
#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub event: &'static str,
    pub id: u64,
    pub data: String,
}

fn snapshot_message(view: &Snapshot, id: u64) -> Message {
    Message {
        event: "snapshot",
        id,
        data: serde_json::to_string(view).expect("a snapshot serializes"),
    }
}

/// What a stream of `viewer` sends for the table as published, given the number of the last moment it has sent (none: it
/// just opened). A cursor the table still holds from gets the moments after it, the last with the table's state; one it
/// does not (too old, or from before a restart) gets a fresh snapshot.
pub fn messages(
    published: &Published,
    viewer: Viewer,
    now: OffsetDateTime,
    cursor: Option<u64>,
) -> Vec<Message> {
    let Some(view) = published.view(viewer, now) else {
        return Vec::new();
    };
    let latest = published.latest_seq();
    let oldest = published
        .moments()
        .front()
        .map_or(latest + 1, |first| first.seq);
    let Some(cursor) = cursor.filter(|&cursor| cursor <= latest && cursor + 1 >= oldest) else {
        return vec![snapshot_message(&view, latest)];
    };
    let batch: Vec<&Arc<Moment>> = published
        .moments()
        .iter()
        .filter(|moment| moment.seq > cursor)
        .collect();
    let last = batch.len().saturating_sub(1);
    batch
        .into_iter()
        .enumerate()
        .map(|(index, moment)| {
            let mut body = moment.json_for(&view);
            if index == last {
                body["state"] = serde_json::to_value(&view).expect("a snapshot serializes");
            }
            Message {
                event: "event",
                id: moment.seq,
                data: body.to_string(),
            }
        })
        .collect()
}
