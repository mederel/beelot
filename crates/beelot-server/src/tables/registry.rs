//! Every table in memory: the registry holds each table's handle and its invitation code, and starts the task that owns
//! the table (see [`super::task`]).

use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use std::time::Duration;

use beelot_game::match_score::DEFAULT_TARGET;
use beelot_game::{Difficulty, KlaverjasRules, Variant};
use dashmap::DashMap;
use time::OffsetDateTime;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;
use uuid::Uuid;

use super::accounts::AccountTables;
use super::counts::{Place, TableCounts};
use super::messages as msg;
use super::store::{self, TableStore, Writer};
use super::task::{self, Outcomes, Removal, Resume, TaskConfig};
use super::{
    Action, Actor, Lobby, Outcome, Table, TableKind, TableSetup, Tutorial, codes, local_seats,
    required_name, valid_target,
};
use crate::api::Snapshot;
use crate::clock::Clock;
use crate::config::Limits;
use crate::error::AppError;

pub use super::task::{TableHandle, TokenHash, viewer_of};

/// The options a solo or pass-and-play table is created with: announcements (US-060), tout-atout
/// and sans-atout (US-063), the match target (US-062) and the Klaverjas rule set (US-214).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LocalOptions {
    pub announcements: bool,
    pub all_trumps: bool,
    pub target: i32,
    pub klaverjas_rules: KlaverjasRules,
}

impl Default for LocalOptions {
    fn default() -> Self {
        Self {
            announcements: true,
            all_trumps: true,
            target: DEFAULT_TARGET,
            klaverjas_rules: KlaverjasRules::default(),
        }
    }
}

/// What a player gets on creating or joining a table: the token that acts at it, and a private table's code.
#[derive(Clone, PartialEq, Eq)]
pub struct Access {
    pub table_id: Uuid,
    pub player_token: String,
    pub code: Option<String>,
}

impl std::fmt::Debug for Access {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Access")
            .field("table_id", &self.table_id)
            .field("player_token", &"<redacted>")
            .field("code", &self.code)
            .finish()
    }
}

/// Spectators watching one table at once, and the tokens a table may have given out in all.
const MAX_SPECTATORS: u32 = 20;
const MAX_WATCH_TOKENS: usize = 200;

pub struct TableRegistry {
    tables: Arc<DashMap<Uuid, Arc<TableHandle>>>,
    /// The tables of each kind, kept as they enter and leave `tables` so that no count walks it.
    counts: Arc<TableCounts>,
    /// The tables each account sits at, kept by the tables' tasks, so that deleting an account asks only those.
    accounts: Arc<AccountTables>,
    codes: Arc<DashMap<String, Uuid>>,
    /// Quick matches run one at a time, so parallel players fill the same tables.
    pub(super) matchmaking: tokio::sync::Mutex<()>,
    clock: Arc<dyn Clock>,
    max_local: usize,
    max_online: usize,
    idle_expiry: Duration,
    pub(super) bot_fill_wait: Duration,
    reconnect_timeout: Duration,
    trick_review: Duration,
    reaction_sequence: Arc<AtomicU64>,
    setup: Box<dyn Fn() -> TableSetup + Send + Sync>,
    outcomes: Outcomes,
    tasks: TaskTracker,
    cancel: CancellationToken,
    /// Where the tables are saved, once a store is given (US-169).
    writer: std::sync::OnceLock<Writer>,
}

impl std::fmt::Debug for TableRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TableRegistry")
            .field("tables", &self.tables.len())
            .field("codes", &self.codes.len())
            .finish_non_exhaustive()
    }
}

impl TableRegistry {
    pub fn new(limits: &Limits, clock: Arc<dyn Clock>) -> Self {
        Self {
            tables: Arc::new(DashMap::new()),
            counts: Arc::default(),
            accounts: Arc::default(),
            codes: Arc::new(DashMap::new()),
            matchmaking: tokio::sync::Mutex::new(()),
            clock,
            max_local: limits.max_local_tables,
            max_online: limits.max_online_tables,
            idle_expiry: limits.idle_expiry,
            bot_fill_wait: limits.bot_fill_wait,
            reconnect_timeout: limits.reconnect_timeout,
            trick_review: limits.trick_review,
            reaction_sequence: Arc::default(),
            setup: Box::new(TableSetup::default),
            outcomes: Outcomes::default(),
            tasks: TaskTracker::new(),
            cancel: CancellationToken::new(),
            writer: std::sync::OnceLock::new(),
        }
    }

    /// Saves the tables to `store` from now on, and brings back those it holds. Call it once, before any table is
    /// opened and inside the runtime; it returns how many tables were restored.
    pub async fn keep_in(&self, store: Arc<dyn TableStore>) -> usize {
        let _ = self.writer.set(Writer::start(store.clone()));
        self.restore(store.as_ref()).await
    }

    /// Brings back the tables active within the idle expiry: the same ids, seats, tokens, codes and scores. A saved table
    /// that cannot be read is dropped with a warning.
    async fn restore(&self, store: &dyn TableStore) -> usize {
        let now = self.now();
        let mut restored = 0;
        for stored in store.load_active(now - self.idle_expiry).await {
            let id = stored.id;
            match store::revive(stored, self.table_setup(), now) {
                Ok(revived) => {
                    let store::Revived {
                        table,
                        tokens,
                        saved,
                        links,
                    } = revived;
                    self.counts.added(table.kind);
                    self.insert_with(
                        table,
                        Resume {
                            saved,
                            links,
                            tokens,
                        },
                    );
                    restored += 1;
                }
                Err(reason) => {
                    tracing::warn!(table = %id, %reason, "a saved table could not be read and is dropped");
                    store.remove(id).await;
                }
            }
        }
        restored
    }

    /// Tables are set up by `setup`: tests deal from seeded generators.
    pub fn with_setup(mut self, setup: impl Fn() -> TableSetup + Send + Sync + 'static) -> Self {
        self.setup = Box::new(setup);
        self
    }

    /// What the tables' own changes leave (a takeover that ends a match, say) goes to `handler`.
    pub fn on_outcome(&self, handler: impl Fn(Outcome) + Send + Sync + 'static) {
        self.outcomes.set(Arc::new(handler));
    }

    pub fn now(&self) -> OffsetDateTime {
        self.clock.now()
    }

    fn table_setup(&self) -> TableSetup {
        (self.setup)()
            .with_reaction_sequence(self.reaction_sequence.clone())
            .with_observer(Arc::new(crate::metrics::MatchMetrics))
    }

    /// The table in memory with this id.
    pub fn handle(&self, id: Uuid) -> Option<Arc<TableHandle>> {
        self.tables.get(&id).map(|entry| entry.value().clone())
    }

    pub(super) fn public_ids(&self) -> Vec<Uuid> {
        self.tables
            .iter()
            .filter(|entry| entry.value().kind == TableKind::Public)
            .map(|entry| *entry.key())
            .collect()
    }

    fn handles(&self) -> Vec<Arc<TableHandle>> {
        self.tables
            .iter()
            .map(|entry| entry.value().clone())
            .collect()
    }

    /// The table and the actor a token acts as there. An unknown table is not found; a token that doesn't act at
    /// it is unauthorized.
    pub fn authorize(&self, id: Uuid, token: &str) -> Result<(Arc<TableHandle>, Actor), AppError> {
        let handle = self.handle(id).ok_or(AppError::NotFound)?;
        let actor = handle
            .actor(token)
            .ok_or_else(AppError::table_unauthorized)?;
        handle.touch(self.now());
        Ok((handle, actor))
    }

    /// A single-use ticket to open the table's event stream from a URL, for the holder of a player token.
    pub fn stream_ticket(&self, id: Uuid, token: &str) -> Result<String, AppError> {
        let (handle, actor) = self.authorize(id, token)?;
        Ok(handle.issue_ticket(actor, token, self.now()))
    }

    /// Like [`authorize`](Self::authorize), with a stream ticket that is used up by it. It also gives the hash of the
    /// token the ticket was issued to, which the table counts the streams of (US-174).
    pub fn authorize_ticket(
        &self,
        id: Uuid,
        ticket: &str,
    ) -> Result<(Arc<TableHandle>, Actor, task::TokenHash), AppError> {
        let handle = self.handle(id).ok_or(AppError::NotFound)?;
        let (actor, owner) = handle
            .take_ticket(ticket, self.now())
            .ok_or_else(AppError::table_unauthorized)?;
        handle.touch(self.now());
        Ok((handle, actor, owner))
    }

    /// The local and the online tables in memory, read from the counters (US-183).
    pub fn counts(&self) -> (usize, usize) {
        self.counts.local_and_online()
    }

    /// The open tables of each kind, for the operator's status page (US-152), read from the counters.
    pub fn kind_counts(&self) -> [(TableKind, usize); 3] {
        [TableKind::Local, TableKind::Private, TableKind::Public]
            .map(|kind| (kind, self.counts.of(kind)))
    }

    /// The same counts by walking every table: what the counters must equal, for the tests.
    #[cfg(test)]
    fn scanned_kind_counts(&self) -> [(TableKind, usize); 3] {
        [TableKind::Local, TableKind::Private, TableKind::Public].map(|wanted| {
            let count = self
                .tables
                .iter()
                .filter(|entry| entry.value().kind == wanted)
                .count();
            (wanted, count)
        })
    }

    /// The human players with an open event stream at their seat, across all tables (US-152). Bots, spectators and
    /// players away from their screen are not counted.
    pub fn connected_players(&self) -> usize {
        self.handles()
            .iter()
            .map(|handle| {
                let streams = handle.open_streams();
                let humans = handle.published().summary.humans;
                (0..4)
                    .filter(|&position| streams[position] > 0 && humans[position])
                    .count()
            })
            .sum()
    }

    /// Takes the place of one more table of that kind, checking the cap and counting in one atomic step (US-181): idle
    /// tables remove themselves, so none is evicted here. The place is given back if the table is never inserted.
    fn reserve(&self, kind: TableKind) -> Result<Place, AppError> {
        let max = if kind == TableKind::Local {
            self.max_local
        } else {
            self.max_online
        };
        if !self.counts.reserve(kind, max) {
            return Err(AppError::CapacityExceeded);
        }
        Ok(Place {
            counts: self.counts.clone(),
            kind,
            kept: false,
        })
    }

    /// Starts the table's task. Must be called inside the runtime.
    fn insert(&self, table: Table, mut place: Place) -> Arc<TableHandle> {
        let handle = self.insert_with(table, Resume::default());
        // Only now does the table's `Removal` own the place: a panic before this gives it back.
        place.kept = true;
        handle
    }

    /// Starts the task of a table, new or restored, whose place is already counted.
    fn insert_with(&self, table: Table, resume: Resume) -> Arc<TableHandle> {
        // A tutorial is not kept (US-199): a restart ends it and the page starts the lesson again.
        let writer = self
            .writer
            .get()
            .cloned()
            .filter(|_| table.tutorial_kind().is_none());
        let (id, code) = (table.id, table.invitation_code.clone());
        if let Some(code) = &code {
            self.codes.insert(code.clone(), id);
        }
        let config = TaskConfig {
            idle_expiry: self.idle_expiry,
            reconnect_timeout: self.reconnect_timeout,
            trick_review: self.trick_review,
            clock: self.clock.clone(),
            outcomes: self.outcomes.clone(),
            cancel: self.cancel.clone(),
            removal: Removal {
                id,
                code,
                tables: self.tables.clone(),
                counts: self.counts.clone(),
                accounts: self.accounts.clone(),
                codes: self.codes.clone(),
                forget: writer.clone().map(|writer| (writer, self.cancel.clone())),
            },
            writer,
        };
        let handle = task::spawn(table, config, &self.tasks, resume);
        self.tables.insert(id, handle.clone());
        handle
    }

    /// Applies a player's action at the table. A table the action leaves empty ends and removes itself.
    pub async fn act(
        &self,
        handle: &TableHandle,
        actor: Actor,
        action: Action,
    ) -> Result<(Outcome, Snapshot), AppError> {
        crate::traces::table_action(
            crate::metrics::kind_label(handle.kind),
            handle.act(actor, action, self.now()),
        )
        .await
    }

    /// Ends the table's task, which removes the table.
    pub fn remove(&self, id: Uuid) {
        if let Some(handle) = self.handle(id) {
            handle.stop();
        }
    }

    /// A solo table, or a pass-and-play one when `seats` names the humans. A solo seat belongs to `account`;
    /// pass-and-play seats belong to nobody, since the players cannot be told apart.
    pub fn create_local(
        &self,
        variant: Variant,
        difficulty: Difficulty,
        options: LocalOptions,
        seats: Option<Vec<Option<String>>>,
        account: Option<Uuid>,
    ) -> Result<Access, AppError> {
        let target = valid_target(options.target)?;
        // A two-seat variant names two seats; the lobby keeps four slots, so the others are blank.
        let seats = seats.map(|mut names| {
            if variant.seat_count() == 2 && names.len() == 2 {
                names.extend([None, None]);
            }
            names
        });
        let mut seated = local_seats(seats.as_deref())?;
        if seats.is_none() {
            seated[0].account = account;
        }
        let place = self.reserve(TableKind::Local)?;
        let table = Table::local(
            Uuid::new_v4(),
            difficulty,
            Lobby::local(
                seated,
                variant,
                options.announcements,
                options.all_trumps,
                target,
            )
            .with_klaverjas_rules(options.klaverjas_rules),
            self.table_setup(),
            self.now(),
        );
        let handle = self.insert(table, place);
        Ok(Access {
            table_id: handle.id,
            player_token: handle.issue_token(Actor::Device),
            code: None,
        })
    }

    /// Opens a tutorial table (US-199): one of the lessons, or the free game. A tutorial is a solo table in the count of
    /// places, and it is not saved.
    pub fn create_tutorial(&self, tutorial: Tutorial) -> Result<Access, AppError> {
        let place = self.reserve(TableKind::Local)?;
        let table = Table::tutorial(Uuid::new_v4(), tutorial, self.table_setup(), self.now())
            .map_err(AppError::from)?;
        let handle = self.insert(table, place);
        Ok(Access {
            table_id: handle.id,
            player_token: handle.issue_token(Actor::Device),
            code: None,
        })
    }

    /// Opens the table of a day's deal (US-150), dealt from `seed`; the signed-in player's account sits North.
    pub fn create_daily(
        &self,
        day: time::Date,
        variant: Variant,
        seed: i64,
        account: Option<Uuid>,
    ) -> Result<Access, AppError> {
        let place = self.reserve(TableKind::Local)?;
        let table = Table::daily(Uuid::new_v4(), day, variant, seed, account, self.now());
        let handle = self.insert(table, place);
        Ok(Access {
            table_id: handle.id,
            player_token: handle.issue_token(Actor::Device),
            code: None,
        })
    }

    /// Opens a private table, joined with its invitation code; the owner sits North.
    pub fn create_private(
        &self,
        name: &str,
        variant: Variant,
        account: Option<Uuid>,
    ) -> Result<Access, AppError> {
        let name = required_name(name)?;
        let place = self.reserve(TableKind::Private)?;
        let code = codes::new_code(|code| self.codes.contains_key(code));
        let lobby = Lobby::private(name, account, variant);
        let id = Uuid::new_v4();
        let table = Table::online(
            id,
            TableKind::Private,
            Some(code.clone()),
            lobby,
            self.table_setup(),
            self.now(),
        );
        let handle = self.insert(table, place);
        Ok(Access {
            table_id: id,
            player_token: handle.issue_token(Actor::Seat(0)),
            code: Some(code),
        })
    }

    /// The table of that invitation code, or the "invalid code" conflict.
    fn by_code(&self, code: &str) -> Result<(Uuid, Arc<TableHandle>), AppError> {
        let invalid = || AppError::conflict("invalid-code", msg::INVALID_CODE);
        let code = codes::normalized(code).ok_or_else(invalid)?;
        let id = self
            .codes
            .get(&code)
            .map(|entry| *entry)
            .ok_or_else(invalid)?;
        let handle = self.handle(id).ok_or_else(invalid)?;
        Ok((id, handle))
    }

    /// Seats a player at the private table of that invitation code.
    pub async fn join(
        &self,
        code: &str,
        name: &str,
        account: Option<Uuid>,
    ) -> Result<Access, AppError> {
        let (id, handle) = self.by_code(code)?;
        let name = required_name(name)?;
        self.seat(&handle, id, name, account).await
    }

    /// Lets someone watch the table with this invitation code, if its owner allowed spectators (US-071).
    pub fn watch(&self, code: &str) -> Result<Access, AppError> {
        let (id, handle) = self.by_code(code)?;
        let summary = handle.published().summary.clone();
        if !summary.spectators_allowed {
            return Err(AppError::conflict("no-spectators", msg::NO_SPECTATORS));
        }
        if summary.watching >= MAX_SPECTATORS || handle.token_count() >= MAX_WATCH_TOKENS {
            return Err(AppError::conflict(
                "too-many-spectators",
                msg::TOO_MANY_SPECTATORS,
            ));
        }
        Ok(Access {
            table_id: id,
            player_token: handle.issue_token(Actor::Spectator),
            code: None,
        })
    }

    /// Seats a player at a table that is still waiting, and gives them their token.
    pub(super) async fn seat(
        &self,
        handle: &TableHandle,
        id: Uuid,
        name: String,
        account: Option<Uuid>,
    ) -> Result<Access, AppError> {
        let position = handle.join(name, account, self.now()).await?;
        Ok(Access {
            table_id: id,
            player_token: handle.issue_token(Actor::Seat(position)),
            code: None,
        })
    }

    /// Opens a public table: bots take its empty seats once the bot-fill wait has passed.
    pub fn open_public(
        &self,
        name: &str,
        variant: Variant,
        account: Option<Uuid>,
    ) -> Result<Access, AppError> {
        let name = required_name(name)?;
        let place = self.reserve(TableKind::Public)?;
        let now = self.now();
        let lobby = Lobby::public(name, account, variant, now + self.bot_fill_wait);
        let id = Uuid::new_v4();
        let table = Table::online(id, TableKind::Public, None, lobby, self.table_setup(), now);
        let handle = self.insert(table, place);
        Ok(Access {
            table_id: id,
            player_token: handle.issue_token(Actor::Seat(0)),
            code: None,
        })
    }

    /// The tables where `account` holds a seat, from the index.
    pub fn tables_of(&self, account: Uuid) -> Vec<Uuid> {
        self.accounts.of(account)
    }

    /// Takes a deleted account away from the tables where it sits: its seats and tokens go, a bot plays its seats in a match, and
    /// a table it leaves empty is removed. Returns what the changes left.
    pub async fn release_account(&self, account: Uuid) -> Vec<Outcome> {
        let now = self.now();
        let mut outcomes = Vec::new();
        for handle in self
            .accounts
            .of(account)
            .into_iter()
            .filter_map(|id| self.handle(id))
        {
            if let Ok(Some(outcome)) = handle.release_account(account, now).await {
                outcomes.push(outcome);
            }
        }
        outcomes
    }

    /// Waits until what the tables have sent to the store is written.
    pub async fn flush_saves(&self) {
        if let Some(writer) = self.writer.get() {
            writer.flush().await;
        }
    }

    /// Stops every table's task and waits for them to end.
    pub async fn shutdown(&self) {
        self.cancel.cancel();
        self.tasks.close();
        self.tasks.wait().await;
        // What the tables sent before they stopped is written before the server ends.
        if let Some(writer) = self.writer.get() {
            writer.flush().await;
        }
    }
}

#[cfg(test)]
#[path = "registry_tests.rs"]
mod tests;
