//! `GET /api/tables/{id}/events`: each player's stream of snapshots. An open stream is the seat's presence: the seat
//! is disconnected once its last stream closes, and connected again when one opens.

use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use futures_util::stream::{self, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tokio_stream::wrappers::WatchStream;

use super::{bearer, table_id};
use crate::app::AppState;
use crate::clock::Clock;
use crate::error::AppError;
use crate::tables::registry::viewer_of;
use crate::tables::stream as table_stream;
use crate::tables::{Actor, TableHandle, TableKind};

const KEEP_ALIVE: Duration = Duration::from_secs(15);

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/tables/{id}/events", get(events))
}

/// `EventSource` cannot set headers, so the stream is opened with a single-use `ticket` in the URL (see
/// `POST /api/tables/{id}/stream-ticket`): a URL reaches a reverse proxy's access log, a ticket is worthless once used.
/// `token` is the deprecated way, kept for clients that predate tickets: it puts the long-lived player token in the URL.
/// `events=1` asks for the moves of the table as events, each with its number as the SSE `id` (US-168); without it the
/// stream sends a `snapshot` for each change, as it did before. `lastEventId` is the number of the last event the client
/// has, for a client that opens the stream again itself with a new ticket: the browser's own reconnection sends the
/// `Last-Event-ID` header instead.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenQuery {
    ticket: Option<String>,
    token: Option<String>,
    events: Option<String>,
    last_event_id: Option<u64>,
}

/// Who a stream belongs to: a seat, or a spectator (US-071).
#[derive(Clone, Copy)]
enum Watcher {
    Seat(usize),
    Spectator,
}

/// While it lives, the seat has one more open stream; dropping the last one disconnects the seat. A spectator's stream
/// counts in the number of spectators the players see.
struct Presence {
    handle: Arc<TableHandle>,
    watcher: Watcher,
    clock: Arc<dyn Clock>,
}

impl Drop for Presence {
    /// Tells the table's task, which does the rest: a destructor cannot wait for it, and need not.
    fn drop(&mut self) {
        let now = self.clock.now();
        match self.watcher {
            Watcher::Seat(seat) => self.handle.stream_closed(seat, now),
            Watcher::Spectator => self.handle.watcher_changed(false, now),
        }
    }
}

/// How the stream starts: refused, or open, with the seat's presence for an online seat.
enum Start {
    Refused(Event),
    Open(Option<Presence>),
}

async fn events(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    // A header or the deprecated query token is a player token; a ticket is used up by opening the stream.
    let (credential, is_ticket) = match (
        bearer(&headers),
        query.ticket.as_deref(),
        query.token.as_deref(),
    ) {
        (Some(token), _, _) => (token, false),
        (None, Some(ticket), _) => (ticket, true),
        (None, None, Some(token)) => (token, false),
        (None, None, None) => return Err(AppError::table_unauthorized()),
    };
    let id = table_id(&id)?;
    let (handle, actor) = if is_ticket {
        state.registry.authorize_ticket(id, credential)?
    } else {
        state.registry.authorize(id, credential)?
    };
    let clock = state.clock.clone();
    let start = match actor {
        Actor::Seat(seat) if handle.kind != TableKind::Local => {
            match handle.reconnect(seat, clock.now()).await {
                Ok(()) => Start::Open(Some(Presence {
                    handle: handle.clone(),
                    watcher: Watcher::Seat(seat),
                    clock: clock.clone(),
                })),
                Err(beelot_table::Refusal::Conflict { code, message }) => Start::Refused(
                    Event::default()
                        .event("error")
                        .data(json!({"error": code, "message": message}).to_string()),
                ),
                Err(other) => return Err(other.into()),
            }
        }
        Actor::Spectator => {
            handle.watcher_changed(true, clock.now());
            Start::Open(Some(Presence {
                handle: handle.clone(),
                watcher: Watcher::Spectator,
                clock: clock.clone(),
            }))
        }
        _ => Start::Open(None),
    };
    let presence = match start {
        Start::Refused(refusal) => {
            return Ok(
                Sse::new(stream::once(async { Ok::<_, Infallible>(refusal) })).into_response(),
            );
        }
        Start::Open(presence) => Arc::new(presence),
    };
    let viewer = viewer_of(actor);
    let numbered = query.events.is_some();
    let mut cursor = query.last_event_id.or_else(|| {
        headers
            .get("last-event-id")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.trim().parse().ok())
    });
    // Each change of the table is read from what its task published: no lock, and no wait for its bots.
    let snapshots = WatchStream::new(handle.subscribe()).flat_map(move |published| {
        // The stream owns the presence: it ends when the client goes.
        let _presence = presence.clone();
        let now = clock.now();
        let sent: Vec<Event> = if numbered {
            let messages = table_stream::messages(&published, viewer, now, cursor);
            if !messages.is_empty() || cursor.is_none() {
                cursor = Some(published.latest_seq());
            }
            messages
                .into_iter()
                .map(|message| {
                    Event::default()
                        .event(message.event)
                        .id(message.id.to_string())
                        .data(message.data)
                })
                .collect()
        } else {
            published
                .view(viewer, now)
                .map(|view| {
                    let data = serde_json::to_string(&view).expect("a snapshot serializes");
                    Event::default().event("snapshot").data(data)
                })
                .into_iter()
                .collect()
        };
        stream::iter(sent.into_iter().map(Ok::<_, Infallible>))
    });
    Ok(Sse::new(snapshots)
        .keep_alive(KeepAlive::new().interval(KEEP_ALIVE))
        .into_response())
}
