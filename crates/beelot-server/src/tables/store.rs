//! Tables kept through a restart (US-169, ADR-006 step 6): what is saved of a table and how it comes back.
//!
//! A table is its [`Origin`] and its [`Entry`] log, so those are saved as the table changes, with the hashes of its tokens.
//! The events name a seat's account by a link made for the table, never by the account: the link table says whose it is and
//! the deletion of an account clears it. A [`Writer`] takes the changes in order from a channel, so the table's task never
//! waits for the database.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

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

/// The way to the store's writer task, cloned into every table.
#[derive(Clone)]
pub struct Writer {
    sender: mpsc::UnboundedSender<Message>,
}

impl std::fmt::Debug for Writer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Writer")
    }
}

impl Writer {
    /// Starts the task that writes to `store`. It ends when every writer is dropped.
    pub fn start(store: Arc<dyn TableStore>) -> Self {
        let (sender, mut inbox) = mpsc::unbounded_channel();
        tokio::spawn(async move {
            while let Some(message) = inbox.recv().await {
                match message {
                    Message::Change(change) => store.save(*change).await,
                    Message::Remove(table) => store.remove(table).await,
                    Message::Flush(done) => {
                        let _ = done.send(());
                    }
                }
            }
        });
        Self { sender }
    }

    pub fn change(&self, change: Change) {
        let _ = self.sender.send(Message::Change(Box::new(change)));
    }

    pub fn remove(&self, table: Uuid) {
        let _ = self.sender.send(Message::Remove(table));
    }

    /// Waits until everything sent before has been written.
    pub async fn flush(&self) {
        let (done, wait) = oneshot::channel();
        if self.sender.send(Message::Flush(done)).is_ok() {
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
