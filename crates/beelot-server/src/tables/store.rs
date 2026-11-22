//! Tables kept through a restart (US-169, ADR-006 step 6): what is saved of a table and how it comes back.
//!
//! A table is its [`Origin`] and its [`Entry`] log, so those are saved as the table changes, with the hashes of its tokens.
//! The events name a seat's account by a link made for the table, never by the account: the link table says whose it is and
//! the deletion of an account clears it. A [`Writer`] takes the changes in order from a channel, so the table's task never
//! waits for the database.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use futures_util::future::BoxFuture;
use time::OffsetDateTime;
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

use super::finished::FinishedMatch;
use super::task::TokenHash;
use super::{Actor, Entry, Event, Origin, Table, TableSetup};

/// The version of the saved format: a log of another one is dropped.
pub const FORMAT: i16 = 1;

/// One event as saved.
#[derive(Debug, Clone)]
pub struct StoredEntry {
    pub seq: usize,
    pub version: u64,
    pub at: OffsetDateTime,
    pub event: String,
}

/// What a table's change adds to what is saved.
#[derive(Debug)]
pub struct Change {
    pub table: Uuid,
    /// The table as it began, on a change that may be the first.
    pub origin: Option<Arc<str>>,
    /// The number of events already saved before `entries`; none for a change of the tokens alone.
    pub from: Option<usize>,
    pub entries: Vec<StoredEntry>,
    pub last_activity: Option<OffsetDateTime>,
    /// The tokens now, as (hash in hex, actor), when they changed.
    pub tokens: Option<Vec<(String, String)>>,
    /// The (link, account) pairs the events use.
    pub links: Vec<(Uuid, Uuid)>,
    /// The matches this change finished, stored in the history in the same transaction.
    pub finished: Vec<FinishedMatch>,
}

/// A table as it is saved, to be revived.
#[derive(Debug)]
pub struct Stored {
    pub id: Uuid,
    pub format: i16,
    pub origin: String,
    pub last_activity: OffsetDateTime,
    pub entries: Vec<StoredEntry>,
    pub tokens: Vec<(String, String)>,
    /// (link, account) of the accounts that still exist.
    pub links: Vec<(Uuid, Uuid)>,
}

/// Where the tables are saved. A store logs its own failures: a write that fails never stops a table.
pub trait TableStore: Send + Sync {
    fn save(&self, change: Change) -> BoxFuture<'_, ()>;
    fn remove(&self, table: Uuid) -> BoxFuture<'_, ()>;
    /// The tables whose last activity is at `since` or later.
    fn load_active(&self, since: OffsetDateTime) -> BoxFuture<'_, Vec<Stored>>;
}

enum Message {
    Change(Box<Change>),
    Remove(Uuid),
    Flush(oneshot::Sender<()>),
}

/// The number of tasks that write, each with its own queue: a table always goes to the same one, so its changes stay in
/// order, and a slow write holds back only the tables of its own shard (US-172).
const SHARDS: usize = 8;
/// The messages a shard's queue holds before the next ones are refused and counted.
const QUEUE: usize = 1024;

/// The way to the store's writer tasks, cloned into every table.
#[derive(Clone)]
pub struct Writer {
    shards: Arc<[mpsc::Sender<Message>]>,
    refused: Arc<AtomicU64>,
}

impl std::fmt::Debug for Writer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Writer")
    }
}

impl Change {
    /// Takes `later`, the change that follows this one for the same table, into this one: they are then saved together.
    /// Gives `later` back when it cannot follow this one (a hole between them), so that the store sees both.
    pub fn absorb(&mut self, later: Change) -> Option<Change> {
        if let (Some(first), Some(from)) = (self.from, later.from) {
            if from > first + self.entries.len() {
                return Some(later);
            }
            // A change that starts before the end of this one replaces the events from there (an undo).
            self.entries.retain(|entry| entry.seq < from);
            self.from = Some(first.min(from));
            self.entries.extend(later.entries);
        } else if later.from.is_some() {
            self.from = later.from;
            self.entries = later.entries;
        }
        self.origin = later.origin.or(self.origin.take());
        self.last_activity = later.last_activity.or(self.last_activity);
        self.tokens = later.tokens.or(self.tokens.take());
        if !later.links.is_empty() {
            self.links = later.links;
        }
        self.finished.extend(later.finished);
        None
    }
}

/// The messages one after the other, with the changes of a table that follow each other merged into one.
fn coalesce(messages: Vec<Message>) -> Vec<Message> {
    let mut out: Vec<Message> = Vec::with_capacity(messages.len());
    // Where the last change of each table is in `out`, until the table is removed.
    let mut last: HashMap<Uuid, usize> = HashMap::new();
    for message in messages {
        match message {
            Message::Change(change) => {
                let table = change.table;
                let rest = match last.get(&table) {
                    Some(&index) => match &mut out[index] {
                        Message::Change(earlier) => earlier.absorb(*change),
                        _ => Some(*change),
                    },
                    None => Some(*change),
                };
                if let Some(change) = rest {
                    last.insert(table, out.len());
                    out.push(Message::Change(Box::new(change)));
                }
            }
            Message::Remove(table) => {
                last.remove(&table);
                out.push(Message::Remove(table));
            }
            flush @ Message::Flush(_) => out.push(flush),
        }
    }
    out
}

async fn run_shard(store: Arc<dyn TableStore>, mut inbox: mpsc::Receiver<Message>) {
    while let Some(first) = inbox.recv().await {
        let mut waiting = vec![first];
        while let Ok(message) = inbox.try_recv() {
            waiting.push(message);
        }
        for message in coalesce(waiting) {
            match message {
                Message::Change(change) => store.save(*change).await,
                Message::Remove(table) => store.remove(table).await,
                Message::Flush(done) => {
                    let _ = done.send(());
                }
            }
        }
    }
}

impl Writer {
    /// Starts the tasks that write to `store`. They end when every writer is dropped.
    pub fn start(store: Arc<dyn TableStore>) -> Self {
        Self::start_with(store, SHARDS, QUEUE)
    }

    pub fn start_with(store: Arc<dyn TableStore>, shards: usize, queue: usize) -> Self {
        let senders = (0..shards.max(1))
            .map(|_| {
                let (sender, inbox) = mpsc::channel(queue.max(1));
                tokio::spawn(run_shard(store.clone(), inbox));
                sender
            })
            .collect();
        Self {
            shards: senders,
            refused: Arc::new(AtomicU64::new(0)),
        }
    }

    /// The shard that writes this table.
    pub fn shard(&self, table: Uuid) -> usize {
        usize::try_from(table.as_u128() % self.shards.len() as u128).unwrap_or(0)
    }

    /// Queues a message; a full queue refuses it, with a warning and a count, rather than let the memory grow.
    fn queue(&self, table: Uuid, message: Message) {
        if self.shards[self.shard(table)].try_send(message).is_err() {
            self.refused.fetch_add(1, Ordering::Relaxed);
            crate::metrics::save_queue_full();
            tracing::warn!(%table, "the queue of table saves is full, so a change is not saved");
        }
    }

    pub fn change(&self, change: Change) {
        self.queue(change.table, Message::Change(Box::new(change)));
    }

    pub fn remove(&self, table: Uuid) {
        self.queue(table, Message::Remove(table));
    }

    /// How many messages a full queue has refused.
    pub fn refused(&self) -> u64 {
        self.refused.load(Ordering::Relaxed)
    }

    /// Waits until everything sent before has been written.
    pub async fn flush(&self) {
        let mut waits = Vec::with_capacity(self.shards.len());
        for shard in self.shards.iter() {
            let (done, wait) = oneshot::channel();
            if shard.send(Message::Flush(done)).await.is_ok() {
                waits.push(wait);
            }
        }
        for wait in waits {
            let _ = wait.await;
        }
    }
}

/// The links of one table: the account of a seat is named by a link in the saved events.
#[derive(Debug, Default)]
pub struct Links {
    by_account: HashMap<Uuid, Uuid>,
}

impl Links {
    fn of(&mut self, account: Uuid) -> Uuid {
        *self.by_account.entry(account).or_insert_with(Uuid::new_v4)
    }

    fn pairs(&self) -> Vec<(Uuid, Uuid)> {
        self.by_account
            .iter()
            .map(|(account, link)| (*link, *account))
            .collect()
    }
}

/// How a table's changes are turned into what is saved.
#[derive(Debug)]
pub struct Persist {
    writer: Writer,
    origin: Arc<str>,
    links: Links,
    /// The events sent so far.
    saved: usize,
    tokens: Vec<(String, String)>,
    /// Whether anything of the table was sent: the first change always goes, even with no event, so the table exists.
    announced: bool,
}

impl Persist {
    pub fn new(writer: Writer, table: &Table, saved: usize, mut links: Links) -> Self {
        let mut origin = table.origin().clone();
        origin.lobby.map_accounts(|account| links.of(account));
        let origin = serde_json::to_string(&origin).expect("an origin serializes");
        Self {
            writer,
            origin: origin.into(),
            links,
            saved,
            tokens: Vec::new(),
            announced: saved > 0,
        }
    }

    pub fn writer(&self) -> &Writer {
        &self.writer
    }

    /// Sends what the table has done since the last time, with the tokens when they differ from the last ones sent.
    pub fn save(
        &mut self,
        table: &Table,
        tokens: Vec<(String, String)>,
        finished: Vec<FinishedMatch>,
    ) {
        let entries: Vec<StoredEntry> = table.entries()[self.saved.min(table.entries().len())..]
            .iter()
            .enumerate()
            .map(|(index, entry)| StoredEntry {
                seq: self.saved + index,
                version: entry.version,
                at: entry.at,
                event: serde_json::to_string(&hide(&entry.event, &mut self.links))
                    .expect("an event serializes"),
            })
            .collect();
        let from = self.saved;
        self.saved = table.entries().len();
        let tokens_changed = tokens != self.tokens;
        if self.announced && entries.is_empty() && finished.is_empty() && !tokens_changed {
            return;
        }
        self.announced = true;
        let tokens = tokens_changed.then(|| {
            self.tokens.clone_from(&tokens);
            tokens
        });
        self.writer.change(Change {
            table: table.id,
            origin: Some(self.origin.clone()),
            from: Some(from),
            entries,
            last_activity: Some(table.last_activity()),
            tokens,
            links: self.links.pairs(),
            finished,
        });
    }
}

/// The event with the link of each account in place of the account.
fn hide(event: &Event, links: &mut Links) -> Event {
    match event {
        Event::Joined { name, account } => Event::Joined {
            name: name.clone(),
            account: account.map(|account| links.of(account)),
        },
        Event::AccountReleased { account } => Event::AccountReleased {
            account: links.of(*account),
        },
        other => other.clone(),
    }
}

pub fn actor_code(actor: Actor) -> String {
    match actor {
        Actor::Seat(seat) => format!("seat:{seat}"),
        Actor::Device => "device".into(),
        Actor::Spectator => "spectator".into(),
    }
}

fn actor_of(code: &str) -> Option<Actor> {
    match code {
        "device" => Some(Actor::Device),
        "spectator" => Some(Actor::Spectator),
        _ => code
            .strip_prefix("seat:")?
            .parse()
            .ok()
            .filter(|seat| *seat < 4)
            .map(Actor::Seat),
    }
}

pub fn hash_hex(hash: &TokenHash) -> String {
    use std::fmt::Write;
    hash.iter()
        .fold(String::with_capacity(64), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

fn hash_of(hex: &str) -> Option<TokenHash> {
    if hex.len() != 64 || !hex.is_ascii() {
        return None;
    }
    let mut hash = [0u8; 32];
    for (index, byte) in hash.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(hash)
}

/// A saved table, brought back.
pub struct Revived {
    pub table: Table,
    pub tokens: Vec<(TokenHash, Actor)>,
    pub saved: usize,
    pub links: Links,
}

/// Brings a saved table back at `now`, or says why it cannot be: a log the server cannot read is dropped by the caller.
pub fn revive(stored: Stored, setup: TableSetup, now: OffsetDateTime) -> Result<Revived, String> {
    if stored.format != FORMAT {
        return Err(format!("the saved format {} is not known", stored.format));
    }
    let known: HashMap<Uuid, Uuid> = stored.links.iter().copied().collect();
    let mut unknown: HashSet<Uuid> = HashSet::new();
    let mut reveal = |link: Uuid| {
        known.get(&link).copied().unwrap_or_else(|| {
            unknown.insert(link);
            link
        })
    };
    let mut origin: Origin =
        serde_json::from_str(&stored.origin).map_err(|error| format!("the origin: {error}"))?;
    origin.lobby.map_accounts(&mut reveal);
    let mut entries = Vec::with_capacity(stored.entries.len());
    for (index, saved) in stored.entries.iter().enumerate() {
        if saved.seq != index {
            return Err(format!("event {index} is missing"));
        }
        let mut event: Event = serde_json::from_str(&saved.event)
            .map_err(|error| format!("event {index}: {error}"))?;
        match &mut event {
            Event::Joined { account, .. } => *account = account.map(&mut reveal),
            Event::AccountReleased { account } => *account = reveal(*account),
            _ => {}
        }
        entries.push(Entry {
            version: saved.version,
            at: saved.at,
            event,
        });
    }
    let id = stored.id;
    if origin.id != id {
        return Err("the origin belongs to another table".into());
    }
    let mut table = Table::replay(&origin, setup, &entries)
        .map_err(|refusal| format!("the events do not replay: {refusal}"))?;
    // A table with no event yet (a private table nobody has joined) has no activity of its own to show.
    table.touch(stored.last_activity.max(table.last_activity()));
    table.forget_accounts(|account| unknown.contains(&account));
    table.restarted(now);
    let mut tokens = Vec::with_capacity(stored.tokens.len());
    for (hash, actor) in &stored.tokens {
        let (Some(hash), Some(actor)) = (hash_of(hash), actor_of(actor)) else {
            return Err("a token is not readable".into());
        };
        tokens.push((hash, actor));
    }
    let mut links = Links::default();
    for (link, account) in &stored.links {
        links.by_account.insert(*account, *link);
    }
    Ok(Revived {
        saved: entries.len(),
        table,
        tokens,
        links,
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;
    use std::time::Duration;

    use time::macros::datetime;
    use tokio::sync::Notify;

    use super::*;

    fn entry(seq: usize, event: &str) -> StoredEntry {
        StoredEntry {
            seq,
            version: seq as u64 + 1,
            at: datetime!(2026-10-24 12:00 UTC),
            event: event.into(),
        }
    }

    fn change(table: Uuid, from: usize, events: &[&str]) -> Change {
        Change {
            table,
            origin: None,
            from: Some(from),
            entries: events
                .iter()
                .enumerate()
                .map(|(index, event)| entry(from + index, event))
                .collect(),
            last_activity: None,
            tokens: None,
            links: Vec::new(),
            finished: Vec::new(),
        }
    }

    fn events(change: &Change) -> Vec<(usize, &str)> {
        change
            .entries
            .iter()
            .map(|entry| (entry.seq, entry.event.as_str()))
            .collect()
    }

    #[test]
    fn a_change_that_follows_another_is_merged_into_it() {
        let table = Uuid::new_v4();
        let mut first = change(table, 0, &["a"]);
        first.origin = Some("origin".into());
        first.tokens = Some(vec![("h".into(), "device".into())]);
        let mut second = change(table, 1, &["b", "c"]);
        second.last_activity = Some(datetime!(2026-10-24 13:00 UTC));
        assert!(first.absorb(second).is_none());
        assert_eq!(first.from, Some(0));
        assert_eq!(events(&first), [(0, "a"), (1, "b"), (2, "c")]);
        assert_eq!(first.origin.as_deref(), Some("origin"));
        assert_eq!(first.tokens.as_ref().map(Vec::len), Some(1));
        assert_eq!(first.last_activity, Some(datetime!(2026-10-24 13:00 UTC)));
    }

    #[test]
    fn a_change_that_goes_back_replaces_the_events_from_there() {
        let table = Uuid::new_v4();
        let mut first = change(table, 0, &["a", "b"]);
        assert!(first.absorb(change(table, 1, &["b2"])).is_none());
        assert_eq!(events(&first), [(0, "a"), (1, "b2")]);
        let mut first = change(table, 2, &["c"]);
        assert!(first.absorb(change(table, 0, &["x"])).is_none());
        assert_eq!((first.from, events(&first)), (Some(0), vec![(0, "x")]));
    }

    #[test]
    fn a_change_after_a_hole_is_given_back() {
        let table = Uuid::new_v4();
        let mut first = change(table, 0, &["a"]);
        let later = first.absorb(change(table, 5, &["z"]));
        assert_eq!(later.map(|change| change.from), Some(Some(5)));
        assert_eq!(events(&first), [(0, "a")]);
    }

    #[test]
    fn a_removal_between_two_changes_keeps_them_apart() {
        let table = Uuid::new_v4();
        let other = Uuid::new_v4();
        let messages = vec![
            Message::Change(Box::new(change(table, 0, &["a"]))),
            Message::Change(Box::new(change(other, 0, &["o"]))),
            Message::Change(Box::new(change(table, 1, &["b"]))),
            Message::Remove(table),
            Message::Change(Box::new(change(table, 0, &["again"]))),
        ];
        let kinds: Vec<String> = coalesce(messages)
            .iter()
            .map(|message| match message {
                Message::Change(change) => format!("change {}", events(change).len()),
                Message::Remove(_) => "remove".into(),
                Message::Flush(_) => "flush".into(),
            })
            .collect();
        assert_eq!(kinds, ["change 2", "change 1", "remove", "change 1"]);
    }

    /// A store that records its saves; the saves of the table it holds back wait for the gate.
    #[derive(Default)]
    struct Recording {
        saved: Mutex<Vec<Change>>,
        slow: Mutex<Option<Uuid>>,
        gate: Notify,
    }

    impl TableStore for Recording {
        fn save(&self, change: Change) -> BoxFuture<'_, ()> {
            Box::pin(async move {
                if *self.slow.lock().unwrap() == Some(change.table) {
                    self.gate.notified().await;
                }
                self.saved.lock().unwrap().push(change);
            })
        }

        fn remove(&self, _table: Uuid) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }

        fn load_active(&self, _since: OffsetDateTime) -> BoxFuture<'_, Vec<Stored>> {
            Box::pin(async { Vec::new() })
        }
    }

    impl Recording {
        fn saved_tables(&self) -> Vec<Uuid> {
            self.saved.lock().unwrap().iter().map(|c| c.table).collect()
        }
    }

    #[tokio::test]
    async fn changes_queued_together_are_saved_together() {
        let store = Arc::new(Recording::default());
        let writer = Writer::start_with(store.clone(), 1, 16);
        let table = Uuid::new_v4();
        for index in 0..5 {
            writer.change(change(table, index, &["e"]));
        }
        writer.flush().await;
        let saved = store.saved.lock().unwrap();
        let entries: usize = saved.iter().map(|change| change.entries.len()).sum();
        assert_eq!(entries, 5);
        assert!(saved.len() < 5, "{} saves for 5 changes", saved.len());
    }

    #[tokio::test]
    async fn a_slow_write_holds_back_no_table_of_another_shard() {
        let store = Arc::new(Recording::default());
        let writer = Writer::start_with(store.clone(), 2, 16);
        let slow = Uuid::new_v4();
        let fast = loop {
            let table = Uuid::new_v4();
            if writer.shard(table) != writer.shard(slow) {
                break table;
            }
        };
        *store.slow.lock().unwrap() = Some(slow);
        writer.change(change(slow, 0, &["a"]));
        writer.change(change(fast, 0, &["b"]));
        let waited = tokio::time::timeout(Duration::from_secs(5), async {
            while !store.saved_tables().contains(&fast) {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await;
        assert!(waited.is_ok(), "the other table waited for the slow one");
        assert!(!store.saved_tables().contains(&slow));
        store.gate.notify_one();
        writer.flush().await;
        assert!(store.saved_tables().contains(&slow));
    }

    #[tokio::test]
    async fn a_full_queue_refuses_and_counts_instead_of_growing() {
        let store = Arc::new(Recording::default());
        let writer = Writer::start_with(store.clone(), 1, 1);
        let table = Uuid::new_v4();
        *store.slow.lock().unwrap() = Some(table);
        writer.change(change(table, 0, &["a"]));
        // The task takes the first change and waits in its save; the queue then holds one more.
        tokio::time::sleep(Duration::from_millis(50)).await;
        writer.change(change(table, 1, &["b"]));
        assert_eq!(writer.refused(), 0);
        writer.change(change(table, 2, &["c"]));
        writer.change(change(table, 3, &["d"]));
        assert_eq!(writer.refused(), 2);
        *store.slow.lock().unwrap() = None;
        store.gate.notify_one();
        writer.flush().await;
    }
}
