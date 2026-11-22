//! A table's task: it owns the [`Table`], takes commands from a channel in order, publishes what readers need after each
//! change and keeps the table's own deadlines (ADR-006). The handle is what the rest of the server holds.

use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use dashmap::DashMap;
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use tokio::sync::{mpsc, oneshot, watch};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use super::accounts::AccountTables;
use super::counts::TableCounts;
use super::finished::FinishedMatch;
use super::published::Published;
use super::store::{Change, Links, Persist, Writer, actor_code, hash_hex};
use super::stream::Recorder;
use super::{Action, Actor, Outcome, Refusal, Table, TableKind};
use crate::api::{Snapshot, Viewer};
use crate::clock::Clock;
use crate::error::AppError;

/// The SHA-256 of a player token: the registry never keeps a token itself.
pub type TokenHash = [u8; 32];

pub(super) fn hash(token: &str) -> TokenHash {
    Sha256::digest(token.as_bytes()).into()
}

/// 32 random bytes in URL-safe base64.
pub(super) fn new_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the operating system's random generator");
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn viewer_of(actor: Actor) -> Viewer {
    match actor {
        Actor::Seat(position) => Viewer::Seat(position),
        Actor::Device => Viewer::Device,
        Actor::Spectator => Viewer::Spectator,
    }
}

/// How long a stream ticket can be used after it is issued.
const STREAM_TICKET_LIFETIME: time::Duration = time::Duration::seconds(30);
/// The tickets a table keeps at most.
const MAX_STREAM_TICKETS: usize = 64;

/// What the outcomes the task produces by itself (a takeover that ends a match, say) are handed to.
pub type OutcomeHandler = Arc<dyn Fn(Outcome) + Send + Sync>;

/// The handler `AppState` sets, shared by every table task.
#[derive(Clone, Default)]
pub struct Outcomes(Arc<RwLock<Option<OutcomeHandler>>>);

impl Outcomes {
    pub fn set(&self, handler: OutcomeHandler) {
        *self
            .0
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(handler);
    }

    fn hand_over(&self, outcome: Outcome) {
        let handler = self
            .0
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        if let Some(handler) = handler {
            handler(outcome);
        }
    }
}

/// What is not the table's own: the tokens that act at it, its stream tickets, its open streams and the last read.
#[derive(Debug)]
struct Shared {
    tokens: DashMap<TokenHash, Actor>,
    /// The stream tickets handed out and not yet used, with their actor and expiry.
    tickets: DashMap<TokenHash, (Actor, OffsetDateTime)>,
    /// The open event streams of each seat.
    streams: [AtomicU32; 4],
    /// When the table was last read or acted on, in Unix milliseconds; reads never wait for the table to note it.
    touched: AtomicI64,
    /// Held while the tokens are read and sent to the writer, so that an older reading never follows a newer one.
    save_order: std::sync::Mutex<()>,
}

impl Shared {
    fn new() -> Self {
        Self {
            tokens: DashMap::new(),
            tickets: DashMap::new(),
            streams: Default::default(),
            touched: AtomicI64::new(i64::MIN),
            save_order: std::sync::Mutex::new(()),
        }
    }

    /// The tokens as saved: the hash in hex and the actor, in order.
    fn token_rows(&self) -> Vec<(String, String)> {
        let mut rows: Vec<(String, String)> = self
            .tokens
            .iter()
            .map(|held| (hash_hex(held.key()), actor_code(*held.value())))
            .collect();
        rows.sort();
        rows
    }

    fn touched(&self) -> Option<OffsetDateTime> {
        let millis = self.touched.load(Ordering::Relaxed);
        (millis != i64::MIN)
            .then(|| OffsetDateTime::from_unix_timestamp_nanos(i128::from(millis) * 1_000_000).ok())
            .flatten()
    }

    fn revoke(&self, actor: Actor) {
        self.tokens.retain(|_, held| *held != actor);
    }

    fn move_tokens(&self, from: usize, to: usize) {
        for mut held in self.tokens.iter_mut() {
            if *held == Actor::Seat(from) {
                *held = Actor::Seat(to);
            }
        }
    }
}

type Reply<T> = oneshot::Sender<T>;

enum Command {
    Act {
        actor: Actor,
        action: Action,
        now: OffsetDateTime,
        reply: Reply<Result<(Outcome, Snapshot), AppError>>,
    },
    Join {
        name: String,
        account: Option<Uuid>,
        now: OffsetDateTime,
        reply: Reply<Result<usize, Refusal>>,
    },
    Reconnect {
        seat: usize,
        now: OffsetDateTime,
        reply: Reply<Result<(), Refusal>>,
    },
    Disconnect {
        seat: usize,
        now: OffsetDateTime,
    },
    Watcher {
        joined: bool,
        now: OffsetDateTime,
    },
    ReleaseAccount {
        account: Uuid,
        now: OffsetDateTime,
        reply: Reply<Option<Outcome>>,
    },
    /// Runs a read on the table, for what is asked rarely enough not to be published.
    Ask(Box<dyn FnOnce(&Table) + Send>),
    Stop,
}

/// How many commands a table's queue holds: past it, a request is refused as busy rather than queued without bound.
pub(super) const COMMAND_QUEUE: usize = 256;

/// One table, as the rest of the server holds it: a way to send it commands and to read what it publishes.
#[derive(Debug)]
pub struct TableHandle {
    pub id: Uuid,
    pub kind: TableKind,
    commands: mpsc::Sender<Command>,
    published: watch::Receiver<Arc<Published>>,
    access: Shared,
    writer: Option<Writer>,
    /// How many times the table was asked to release an account: what the tests count.
    #[cfg(test)]
    pub(super) releases: std::sync::atomic::AtomicUsize,
}

impl TableHandle {
    /// The table as of its last change.
    pub fn published(&self) -> Arc<Published> {
        self.published.borrow().clone()
    }

    /// A receiver of the table's versions: the streams wait on it.
    pub fn subscribe(&self) -> watch::Receiver<Arc<Published>> {
        self.published.clone()
    }

    /// The table as `actor` sees it at `now`.
    pub fn snapshot(&self, actor: Actor, now: OffsetDateTime) -> Result<Snapshot, AppError> {
        self.published()
            .view(viewer_of(actor), now)
            .ok_or(AppError::NotFound)
    }

    /// Notes that the table is in use, so it is not removed as idle.
    pub fn touch(&self, now: OffsetDateTime) {
        let millis = i64::try_from(now.unix_timestamp_nanos() / 1_000_000).unwrap_or(i64::MAX);
        self.access.touched.fetch_max(millis, Ordering::Relaxed);
    }

    /// Queues a command: a table whose queue is full refuses it as busy (US-181), a table that is gone is not found.
    fn send(&self, command: Command) -> Result<(), AppError> {
        self.commands
            .try_send(command)
            .map_err(|error| match error {
                mpsc::error::TrySendError::Full(_) => AppError::CapacityExceeded,
                mpsc::error::TrySendError::Closed(_) => AppError::NotFound,
            })
    }

    /// Queues a command that must not be lost, from a place that cannot report a refusal (a destructor): a full queue
    /// is waited on in a task of its own.
    fn send_always(&self, command: Command) {
        if let Err(mpsc::error::TrySendError::Full(command)) = self.commands.try_send(command) {
            let commands = self.commands.clone();
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                runtime.spawn(async move {
                    let _ = commands.send(command).await;
                });
            }
        }
    }

    async fn call<T>(&self, command: impl FnOnce(Reply<T>) -> Command) -> Result<T, AppError> {
        let (reply, answer) = oneshot::channel();
        self.send(command(reply))?;
        // A table that ends before it answers is a table that is gone.
        answer.await.map_err(|_| AppError::NotFound)
    }

    pub(super) fn issue_token(&self, actor: Actor) -> String {
        let token = new_token();
        if let Some(writer) = &self.writer {
            let _order = self
                .access
                .save_order
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            self.access.tokens.insert(hash(&token), actor);
            writer.change(Change {
                table: self.id,
                origin: None,
                from: None,
                entries: Vec::new(),
                last_activity: None,
                tokens: Some(self.access.token_rows()),
                links: Vec::new(),
                finished: Vec::new(),
            });
        } else {
            self.access.tokens.insert(hash(&token), actor);
        }
        token
    }

    /// Puts back the tokens a restored table had.
    pub(super) fn restore_tokens(&self, tokens: Vec<(TokenHash, Actor)>) {
        for (hash, actor) in tokens {
            self.access.tokens.insert(hash, actor);
        }
    }

    pub(super) fn actor(&self, token: &str) -> Option<Actor> {
        self.access.tokens.get(&hash(token)).map(|held| *held)
    }

    pub(super) fn token_count(&self) -> usize {
        self.access.tokens.len()
    }

    /// A ticket that opens one event stream for `actor` within 30 seconds: `EventSource` can only put a credential in
    /// the URL, and a URL ends up in proxy logs, so the URL gets this, never the player token.
    pub(super) fn issue_ticket(&self, actor: Actor, now: OffsetDateTime) -> String {
        let ticket = new_token();
        self.access.tickets.retain(|_, (_, expires)| *expires > now);
        if self.access.tickets.len() >= MAX_STREAM_TICKETS {
            // A flood of requests cannot make the table's memory grow: the oldest ticket goes.
            let oldest = self
                .access
                .tickets
                .iter()
                .min_by_key(|entry| entry.value().1)
                .map(|entry| *entry.key());
            if let Some(oldest) = oldest {
                self.access.tickets.remove(&oldest);
            }
        }
        self.access
            .tickets
            .insert(hash(&ticket), (actor, now + STREAM_TICKET_LIFETIME));
        ticket
    }

    /// The actor a ticket opens a stream for. A ticket works once, and only until it expires.
    pub(super) fn take_ticket(&self, ticket: &str, now: OffsetDateTime) -> Option<Actor> {
        let (_, (actor, expires)) = self.access.tickets.remove(&hash(ticket))?;
        (expires > now).then_some(actor)
    }

    /// Applies a player's action and returns what it leaves, with the table as that player now sees it. A player who
    /// moves keeps their token; one who leaves loses it.
    pub async fn act(
        &self,
        actor: Actor,
        action: Action,
        now: OffsetDateTime,
    ) -> Result<(Outcome, Snapshot), AppError> {
        self.call(|reply| Command::Act {
            actor,
            action,
            now,
            reply,
        })
        .await?
    }

    /// Seats a player, at the first free seat.
    pub(super) async fn join(
        &self,
        name: String,
        account: Option<Uuid>,
        now: OffsetDateTime,
    ) -> Result<usize, AppError> {
        self.call(|reply| Command::Join {
            name,
            account,
            now,
            reply,
        })
        .await?
        .map_err(AppError::from)
    }

    /// Marks the seat connected again, before its stream opens. The stream is counted first, so that a close that
    /// races with it does not disconnect the seat.
    pub async fn reconnect(&self, seat: usize, now: OffsetDateTime) -> Result<(), Refusal> {
        self.access.streams[seat].fetch_add(1, Ordering::SeqCst);
        let answered = self
            .call(|reply| Command::Reconnect { seat, now, reply })
            .await;
        match answered {
            Ok(Ok(())) => Ok(()),
            Ok(Err(refusal)) => {
                self.access.streams[seat].fetch_sub(1, Ordering::SeqCst);
                Err(refusal)
            }
            Err(_) => {
                self.access.streams[seat].fetch_sub(1, Ordering::SeqCst);
                Err(Refusal::NotFound)
            }
        }
    }

    /// A stream of the seat closed: at the last one, the seat is disconnected. Safe to call from a destructor.
    pub fn stream_closed(&self, seat: usize, now: OffsetDateTime) {
        let open = &self.access.streams[seat];
        let mut before = open.load(Ordering::SeqCst);
        while let Err(current) = open.compare_exchange(
            before,
            before.saturating_sub(1),
            Ordering::SeqCst,
            Ordering::SeqCst,
        ) {
            before = current;
        }
        if before <= 1 {
            // A table that is gone has nothing to disconnect.
            self.send_always(Command::Disconnect { seat, now });
        }
    }

    /// The seats' streams that are open now.
    pub fn open_streams(&self) -> [u32; 4] {
        std::array::from_fn(|seat| self.access.streams[seat].load(Ordering::SeqCst))
    }

    /// A spectator's stream opened or closed: the players see the new count. Safe to call from a destructor.
    pub fn watcher_changed(&self, joined: bool, now: OffsetDateTime) {
        self.send_always(Command::Watcher { joined, now });
    }

    /// Takes a deleted account away from the table; `None` when it holds no seat there.
    pub(super) async fn release_account(
        &self,
        account: Uuid,
        now: OffsetDateTime,
    ) -> Result<Option<Outcome>, AppError> {
        #[cfg(test)]
        self.releases.fetch_add(1, Ordering::Relaxed);
        // A deletion must reach every table, so it waits for room in a busy queue instead of being refused.
        let (reply, answer) = oneshot::channel();
        self.commands
            .send(Command::ReleaseAccount {
                account,
                now,
                reply,
            })
            .await
            .map_err(|_| AppError::NotFound)?;
        answer.await.map_err(|_| AppError::NotFound)
    }

    /// Runs `read` on the table itself, in order with its commands. For what is asked rarely: it waits while the
    /// table's bots are thinking.
    pub async fn ask<T: Send + 'static>(
        &self,
        read: impl FnOnce(&Table) -> T + Send + 'static,
    ) -> Result<T, AppError> {
        let (reply, answer) = oneshot::channel();
        self.send(Command::Ask(Box::new(move |table| {
            let _ = reply.send(read(table));
        })))?;
        answer.await.map_err(|_| AppError::NotFound)
    }

    /// Asks the table to end; it is removed from the registry as it does.
    pub fn stop(&self) {
        self.send_always(Command::Stop);
    }
}

/// How a table task is set up: the timed rules and where its changes go.
pub(super) struct TaskConfig {
    pub idle_expiry: Duration,
    pub reconnect_timeout: Duration,
    pub trick_review: Duration,
    pub clock: Arc<dyn Clock>,
    pub outcomes: Outcomes,
    pub cancel: CancellationToken,
    /// Removes the table from the registry when the task ends, however it ends.
    pub removal: Removal,
    /// Where the table's changes are saved, when tables are kept through a restart.
    pub writer: Option<Writer>,
}

/// What a table brought back from its saved events starts with.
#[derive(Default)]
pub(super) struct Resume {
    pub saved: usize,
    pub links: Links,
    pub tokens: Vec<(TokenHash, Actor)>,
}

/// Removes a table and its invitation code from the registry when dropped: the task's end, a panic included.
pub(super) struct Removal {
    pub id: Uuid,
    pub code: Option<String>,
    pub tables: Arc<DashMap<Uuid, Arc<TableHandle>>>,
    pub counts: Arc<TableCounts>,
    /// The index of the accounts seated at tables: the table's entry goes with it.
    pub accounts: Arc<AccountTables>,
    pub codes: Arc<DashMap<String, Uuid>>,
    /// Where the table's saved events are deleted when it ends, unless it ends because the server stops.
    pub forget: Option<(Writer, CancellationToken)>,
}

impl Removal {
    /// Takes the table and its code out of the registry; doing it twice does no harm, and never takes a code that
    /// another table holds by now.
    fn remove(&self) {
        if let Some((_, handle)) = self.tables.remove(&self.id) {
            self.counts.removed(handle.kind);
        }
        self.accounts.clear(self.id);
        if let Some(code) = &self.code {
            self.codes.remove_if(code, |_, held| *held == self.id);
        }
        if let Some((writer, cancel)) = &self.forget
            && !cancel.is_cancelled()
        {
            writer.remove(self.id);
        }
    }
}

impl Drop for Removal {
    fn drop(&mut self) {
        self.remove();
    }
}

/// Starts the table's task and returns its handle.
pub(super) fn spawn(
    table: Table,
    config: TaskConfig,
    tracker: &tokio_util::task::TaskTracker,
    resume: Resume,
) -> Arc<TableHandle> {
    let (commands, inbox) = mpsc::channel(COMMAND_QUEUE);
    let first = Published::of(&table);
    let recorder = Recorder::new(&table, &first);
    let (publisher, published) = watch::channel(Arc::new(first));
    let handle = Arc::new(TableHandle {
        id: table.id,
        kind: table.kind,
        commands,
        published,
        access: Shared::new(),
        writer: config.writer.clone(),
        #[cfg(test)]
        releases: Default::default(),
    });
    handle.restore_tokens(resume.tokens);
    let persist = config
        .writer
        .clone()
        .map(|writer| Persist::new(writer, &table, resume.saved, resume.links));
    let mut task = Task {
        handle: handle.clone(),
        publisher,
        config,
        table: Some(table),
        stalled: false,
        recorder,
        persist,
    };
    // The first change goes out before any token is issued, so the writer has the table before its tokens.
    task.save(Vec::new());
    task.index_accounts();
    tracker.spawn(task.run(inbox));
    handle
}

struct Task {
    handle: Arc<TableHandle>,
    publisher: watch::Sender<Arc<Published>>,
    config: TaskConfig,
    /// Absent only while a bot's search has it in the blocking pool.
    table: Option<Table>,
    /// The last wake-up found a deadline due and changed nothing.
    stalled: bool,
    /// What the streams are told about each change.
    recorder: Recorder,
    /// How the changes are saved, when they are.
    persist: Option<Persist>,
}

/// How long a task waits again after a due deadline that its table could not settle.
const STALLED_WAIT: Duration = Duration::from_secs(1);

/// The table is gone: a search panicked.
struct Lost;

impl Task {
    async fn run(mut self, mut inbox: mpsc::Receiver<Command>) {
        let id = self.handle.id;
        loop {
            let wait = self.wait();
            let alive = tokio::select! {
                () = self.config.cancel.cancelled() => false,
                command = inbox.recv() => match command {
                    Some(command) => self.handle(command).await,
                    None => false,
                },
                () = tokio::time::sleep(wait) => self.wake().await,
            };
            if !alive {
                break;
            }
        }
        tracing::debug!(table = %id, "the table's task ended");
        // `self` drops here: the guard in the config removes the table.
    }

    fn table(&self) -> &Table {
        self.table.as_ref().expect("the table is in its task")
    }

    /// When the table's next deadline falls, as a wait from now: the earliest of its own and its idle expiry.
    fn wait(&self) -> Duration {
        let table = self.table();
        let now = self.config.clock.now();
        let idle = self.idle_at();
        let due = table
            .next_deadline(self.config.reconnect_timeout, self.config.trick_review)
            .map_or(idle, |deadline| deadline.min(idle));
        let wait: Duration = (due - now).try_into().unwrap_or(Duration::ZERO);
        // A deadline that a tick could not settle must not spin the task.
        if self.stalled {
            wait.max(STALLED_WAIT)
        } else {
            wait
        }
    }

    /// When the table is removed for want of use: the later of its own activity and the last read, plus the expiry.
    fn idle_at(&self) -> OffsetDateTime {
        let table = self.table();
        let last = self
            .handle
            .access
            .touched()
            .map_or(table.last_activity(), |touched| {
                touched.max(table.last_activity())
            });
        last + self.config.idle_expiry
    }

    /// A timer fired: remove the table if it is idle, else do what is due. False when the task is over.
    async fn wake(&mut self) -> bool {
        let now = self.config.clock.now();
        if self.idle_at() <= now {
            return false;
        }
        let (reconnect, review) = (self.config.reconnect_timeout, self.config.trick_review);
        let version = self.table().version();
        let Ok(outcomes) = self
            .with_table(move |table| table.tick(now, reconnect, review))
            .await
        else {
            return false;
        };
        self.stalled = self.table().version() == version;
        let mut outcomes = outcomes;
        let finished = outcomes
            .iter_mut()
            .flat_map(|outcome| self.take_finished(outcome))
            .collect();
        self.publish_with(finished);
        for outcome in outcomes {
            self.config.outcomes.hand_over(outcome);
        }
        true
    }

    /// Runs `work` on the table. Where a bot may search, the table goes to the blocking pool and comes back, so that
    /// the task's thread is never held and the published state keeps answering the reads.
    async fn with_table<R: Send + 'static>(
        &mut self,
        work: impl FnOnce(&mut Table) -> R + Send + 'static,
    ) -> Result<R, Lost> {
        let mut table = self.table.take().expect("the table is in its task");
        if !table.needs_blocking_bot() {
            let answer = work(&mut table);
            self.table = Some(table);
            return Ok(answer);
        }
        match tokio::task::spawn_blocking(move || {
            let answer = work(&mut table);
            (table, answer)
        })
        .await
        {
            Ok((table, answer)) => {
                self.table = Some(table);
                Ok(answer)
            }
            Err(error) => {
                tracing::error!(table = %self.handle.id, %error, "a table's search failed, so the table is closed");
                Err(Lost)
            }
        }
    }

    /// Where there is a store, the match a change finished goes in the same write as the change, not to the history on its
    /// own: the outcome keeps no copy.
    fn take_finished(&self, outcome: &mut Outcome) -> Vec<FinishedMatch> {
        if self.persist.is_none() {
            return Vec::new();
        }
        outcome
            .finished
            .take()
            .filter(FinishedMatch::has_signed_in_player)
            .into_iter()
            .collect()
    }

    /// Sends what the table has done since the last time to the store.
    fn save(&mut self, finished: Vec<FinishedMatch>) {
        let Some(persist) = self.persist.as_mut() else {
            return;
        };
        let table = self.table.as_ref().expect("the table is in its task");
        let _order = self
            .handle
            .access
            .save_order
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        persist.save(table, self.handle.access.token_rows(), finished);
    }

    /// Records the accounts seated at the table, as first published.
    fn index_accounts(&self) {
        let seated = self.publisher.borrow().summary.accounts.clone();
        self.config.removal.accounts.set(self.handle.id, seated);
    }

    /// Publishes the table if it changed.
    fn publish(&mut self) {
        self.publish_with(Vec::new());
    }

    /// Publishes the table if it changed, and saves it with the matches the change finished.
    fn publish_with(&mut self, finished: Vec<FinishedMatch>) {
        self.save(finished);
        let table = self.table.as_ref().expect("the table is in its task");
        if self.publisher.borrow().version != table.version() {
            let published = Published::of(table);
            self.config
                .removal
                .accounts
                .set(self.handle.id, published.summary.accounts.clone());
            self.recorder.record(table, &published);
            let latest = self.recorder.latest();
            let published = published.with_moments(self.recorder.moments(), latest);
            self.publisher.send_replace(Arc::new(published));
        }
    }

    /// Handles one command. False when the task is over.
    async fn handle(&mut self, command: Command) -> bool {
        self.stalled = false;
        match command {
            Command::Act {
                actor,
                action,
                now,
                reply,
            } => self.act(actor, action, now, reply).await,
            Command::Join {
                name,
                account,
                now,
                reply,
            } => {
                let Ok(answer) = self
                    .with_table(move |table| table.join(name, account, now))
                    .await
                else {
                    return false;
                };
                self.publish();
                let _ = reply.send(answer);
                true
            }
            Command::Reconnect { seat, now, reply } => {
                let Ok(answer) = self
                    .with_table(move |table| {
                        table.touch(now);
                        table.reconnect(seat)
                    })
                    .await
                else {
                    return false;
                };
                self.publish();
                let _ = reply.send(answer);
                true
            }
            Command::Disconnect { seat, now } => {
                // A stream opened since the close was noted keeps the seat connected.
                if self.handle.access.streams[seat].load(Ordering::SeqCst) > 0 {
                    return true;
                }
                let Ok(_) = self
                    .with_table(move |table| {
                        let _ = table.disconnect(seat, now);
                    })
                    .await
                else {
                    return false;
                };
                self.publish();
                true
            }
            Command::Watcher { joined, now } => {
                let Ok(()) = self
                    .with_table(move |table| {
                        table.touch(now);
                        table.watcher_changed(joined);
                    })
                    .await
                else {
                    return false;
                };
                self.publish();
                true
            }
            Command::ReleaseAccount {
                account,
                now,
                reply,
            } => self.release_account(account, now, reply).await,
            Command::Ask(read) => {
                read(self.table());
                true
            }
            Command::Stop => false,
        }
    }

    async fn act(
        &mut self,
        actor: Actor,
        action: Action,
        now: OffsetDateTime,
        reply: Reply<Result<(Outcome, Snapshot), AppError>>,
    ) -> bool {
        let moved_to = match action {
            Action::Seat { position } => Some(position),
            _ => None,
        };
        let leaving = action == Action::Leave;
        let Ok(result) = self
            .with_table(move |table| table.apply(actor, action, now))
            .await
        else {
            return false;
        };
        let mut outcome = match result {
            Ok(outcome) => outcome,
            Err(refusal) => {
                let _ = reply.send(Err(refusal.into()));
                return true;
            }
        };
        let mut viewer = actor;
        if let (Actor::Seat(from), Some(to)) = (actor, moved_to) {
            self.handle.access.move_tokens(from, to);
            viewer = Actor::Seat(to);
        }
        if leaving {
            self.handle.access.revoke(actor);
        }
        let finished = self.take_finished(&mut outcome);
        self.publish_with(finished);
        let removed = outcome.removed;
        if removed {
            self.config.removal.remove();
        }
        let view = self.handle.snapshot(viewer, now);
        let _ = reply.send(view.map(|view| (outcome, view)));
        !removed
    }

    async fn release_account(
        &mut self,
        account: Uuid,
        now: OffsetDateTime,
        reply: Reply<Option<Outcome>>,
    ) -> bool {
        let seats: Vec<usize> = self
            .table()
            .lobby()
            .occupied()
            .filter(|(_, seat)| seat.account == Some(account))
            .map(|(position, _)| position)
            .collect();
        if seats.is_empty() {
            let _ = reply.send(None);
            return true;
        }
        for position in seats {
            self.handle
                .access
                .revoke(if self.handle.kind == TableKind::Local {
                    Actor::Device
                } else {
                    Actor::Seat(position)
                });
        }
        let Ok(mut outcome) = self
            .with_table(move |table| table.release_account(account, now))
            .await
        else {
            return false;
        };
        let finished = self.take_finished(&mut outcome);
        self.publish_with(finished);
        let removed = outcome.removed;
        if removed {
            self.config.removal.remove();
        }
        let _ = reply.send(Some(outcome));
        !removed
    }
}
