//! Friends and table invitations (US-070). A player shares a personal link; whoever opens it asks to be a friend, and
//! the friendship counts once the owner of the link accepts. A table's owner invites online friends, who find the
//! invitation the next time they ask for their friends and join in one click.

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use super::{ApiJson, bearer, blocking, table_id};
use crate::app::AppState;
use crate::auth::MaybeSession;
use crate::db::{accounts, friends};
use crate::error::AppError;

/// A friend is online when one of their sessions was seen this recently (sessions are marked every minute).
const ONLINE_WITHIN: Duration = Duration::minutes(3);

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/friends", get(overview))
        .route("/api/friends/link", post(add_by_link))
        .route("/api/friends/{id}/accept", post(accept))
        .route("/api/friends/{id}", delete(remove))
        .route("/api/invites/{id}", delete(dismiss))
        .route("/api/tables/{id}/invite", post(invite))
}

fn signed_in(session: &MaybeSession) -> Result<Uuid, AppError> {
    session.account().ok_or(AppError::Unauthorized {
        code: "sign-in-required",
        message: "Sign in to use friends.",
    })
}

fn account_id(text: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(text).map_err(|_| AppError::BadRequest)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersonView {
    id: Uuid,
    name: String,
    online: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InviteView {
    id: i64,
    from: String,
    table_id: Uuid,
    code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Overview {
    code: String,
    friends: Vec<PersonView>,
    requests: Vec<PersonView>,
    invites: Vec<InviteView>,
}

fn person(person: friends::Person, now: OffsetDateTime) -> PersonView {
    PersonView {
        id: person.id,
        online: person
            .last_seen
            .is_some_and(|seen| seen > now - ONLINE_WITHIN),
        name: person.name,
    }
}

/// The player's friend link code, friends, requests waiting for them and invitations to tables.
async fn overview(
    State(state): State<AppState>,
    session: MaybeSession,
) -> Result<Json<Overview>, AppError> {
    let me = signed_in(&session)?;
    let now = state.clock.now();
    let fresh = Uuid::new_v4().simple().to_string();
    let code = friends::code_of(&state.pool, me, &fresh).await?;
    let friends_list = friends::friends(&state.pool, me).await?;
    let requests = friends::requests(&state.pool, me).await?;
    let invites = friends::invites_for(&state.pool, me, now).await?;
    Ok(Json(Overview {
        code,
        friends: friends_list.into_iter().map(|p| person(p, now)).collect(),
        requests: requests.into_iter().map(|p| person(p, now)).collect(),
        invites: invites
            .into_iter()
            .map(|invite| InviteView {
                id: invite.id,
                from: invite.from,
                table_id: invite.table_id,
                code: invite.code,
            })
            .collect(),
    }))
}

#[derive(Debug, Deserialize)]
struct LinkRequest {
    code: String,
}

#[derive(Debug, Serialize)]
struct LinkResult {
    /// `requested` while the owner of the link has not accepted, `friends` once they are.
    status: &'static str,
    name: String,
}

/// Opening someone's friend link asks them to be friends; if they had asked first, the two are friends at once.
async fn add_by_link(
    State(state): State<AppState>,
    session: MaybeSession,
    ApiJson(request): ApiJson<LinkRequest>,
) -> Result<Json<LinkResult>, AppError> {
    let me = signed_in(&session)?;
    let other = friends::account_for_code(&state.pool, request.code.trim())
        .await?
        .ok_or_else(|| {
            AppError::conflict("invalid-friend-link", "This friend link is not valid.")
        })?;
    if other == me {
        return Err(AppError::conflict(
            "own-friend-link",
            "This is your own friend link.",
        ));
    }
    let name = accounts::find(&state.pool, other)
        .await?
        .map(|account| account.display_name)
        .ok_or(AppError::NotFound)?;
    let status = match friends::between(&state.pool, me, other).await? {
        Some((_, true)) => "friends",
        Some((requester, false)) if requester == other => {
            friends::accept(&state.pool, me, other).await?;
            "friends"
        }
        Some(_) => "requested",
        None => {
            friends::request(&state.pool, me, other, state.clock.now()).await?;
            "requested"
        }
    };
    Ok(Json(LinkResult { status, name }))
}

async fn accept(
    State(state): State<AppState>,
    session: MaybeSession,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let me = signed_in(&session)?;
    if friends::accept(&state.pool, me, account_id(&id)?).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}

/// Removes a friend, or declines a request.
async fn remove(
    State(state): State<AppState>,
    session: MaybeSession,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let me = signed_in(&session)?;
    friends::remove(&state.pool, me, account_id(&id)?).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn dismiss(
    State(state): State<AppState>,
    session: MaybeSession,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let me = signed_in(&session)?;
    friends::dismiss_invite(&state.pool, me, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InviteRequest {
    friend_id: Uuid,
}

/// The owner of a waiting private table invites a friend: the friend finds the invitation, with the table's code.
async fn invite(
    State(state): State<AppState>,
    session: MaybeSession,
    Path(id): Path<String>,
    headers: HeaderMap,
    ApiJson(request): ApiJson<InviteRequest>,
) -> Result<StatusCode, AppError> {
    let me = signed_in(&session)?;
    let token = bearer(&headers)
        .ok_or_else(AppError::table_unauthorized)?
        .to_owned();
    let id = table_id(&id)?;
    let registry = state.registry.clone();
    let (table, code) = blocking(move || {
        let (handle, actor) = registry.authorize(id, &token)?;
        let table = handle.state.lock().unwrap();
        table.invitation(actor)
    })
    .await??;
    match friends::between(&state.pool, me, request.friend_id).await? {
        Some((_, true)) => {}
        _ => {
            return Err(AppError::conflict(
                "not-a-friend",
                "You can only invite your friends.",
            ));
        }
    }
    friends::invite(
        &state.pool,
        me,
        request.friend_id,
        table,
        &code,
        state.clock.now(),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
