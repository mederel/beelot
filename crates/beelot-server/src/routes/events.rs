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
use crate::tables::{Actor, TableHandle, TableKind};

const KEEP_ALIVE: Duration = Duration::from_secs(15);

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/tables/{id}/events", get(events))
}

/// `EventSource` cannot set headers, so the stream is opened with a single-use `ticket` in the URL (see
/// `POST /api/tables/{id}/stream-ticket`): a URL reaches a reverse proxy's access log, a ticket is worthless once used.
/// `token` is the deprecated way, kept for clients that predate tickets: it puts the long-lived player token in the URL.
#[derive(Deserialize)]
struct TokenQuery {
    ticket: Option<String>,
    token: Option<String>,
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
    // Each change of the table is read from what its task published: no lock, and no wait for its bots.
    let snapshots = WatchStream::new(handle.subscribe()).filter_map(move |published| {
        // The stream owns the presence: it ends when the client goes.
        let _presence = presence.clone();
        let now = clock.now();
        async move {
            let view = published.view(viewer, now)?;
            let data = serde_json::to_string(&view).expect("a snapshot serializes");
            Some(Ok::<_, Infallible>(
                Event::default().event("snapshot").data(data),
            ))
        }
    });
    Ok(Sse::new(snapshots)
        .keep_alive(KeepAlive::new().interval(KEEP_ALIVE))
        .into_response())
}
