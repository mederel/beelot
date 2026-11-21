//! One table: its seats, the auction or the card play, the match score, and the bots that play their turns. Solo,
//! pass-and-play and online tables are all this one model; they differ by their seats and their kind.
//!
//! A table changes only through its events (ADR-006): a command is checked, the bots take their turns, and each change is
//! an [`Event`] that `apply_event` applies and the table keeps. Rebuilding a table from its origin and its events
//! ([`Table::replay`]) runs no bot and draws no random number.

use std::sync::Arc;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::time::Duration;

use beelot_game::bidding::AuctionDecision;
use beelot_game::bidding::BiddingState;
use beelot_game::board::GameBoard;
use beelot_game::bot::hints::{auction_hint, card_hint};
use beelot_game::bot::review::{PlayReason, play_reasons};
use beelot_game::bot::{BotStrategy, strategies};
use beelot_game::match_score::MatchScore;
use beelot_game::{Card, Difficulty, GameError, RandomSource, Rank, SplitMix64};
use time::OffsetDateTime;
use uuid::Uuid;

use super::actions::Action;
use super::daily::DailyResult;
use super::event::{Entry, Event, Origin};
use super::finished::{DELETED_PLAYER, FinishedMatch, FinishedSeat, Mode};
use super::hints::CardView;
use super::hints::{BidHint, Hint};
use super::messages as msg;
use super::observer::{NoObserver, Observer};
use super::reactions::{Reaction, Reactions};
use super::seats::{Connection, Lobby, Seat, SeatKind, Status, TableKind};
use crate::Refusal;

/// Draws the seed of each new deal, or of the draw of a match's first dealer.
pub type SeedSource = Arc<dyn Fn() -> i64 + Send + Sync>;

/// A seed from the operating system's generator: production deals need no reproducibility.
fn os_seed() -> i64 {
    let mut bytes = [0u8; 8];
    getrandom::fill(&mut bytes).expect("the operating system's random generator");
    i64::from_ne_bytes(bytes)
}

/// How a table deals and which strategy its bots play. Production deals from seeds drawn from the operating system's
/// generator; each seed is kept in the event of its deal, so the deal can be dealt again.
#[derive(Clone)]
pub struct TableSetup {
    seeds: SeedSource,
    /// Draws the first dealer of each match; without one, a match starts with `FIRST_DEALER`, so that seeded
    /// tables keep the deals the tests replay.
    first_dealer: Option<SeedSource>,
    strategy: Option<&'static dyn BotStrategy>,
    reactions: Arc<AtomicU64>,
    observer: Arc<dyn Observer>,
}

impl Default for TableSetup {
    fn default() -> Self {
        Self {
            seeds: Arc::new(os_seed),
            first_dealer: Some(Arc::new(os_seed)),
            strategy: None,
            reactions: Arc::default(),
            observer: Arc::new(NoObserver),
        }
    }
}

impl TableSetup {
    /// Deals from seeds derived from `seed`, one per deal, so tests replay the same deals.
    pub fn seeded(seed: i64) -> Self {
        let deals = Arc::new(AtomicI64::new(0));
        Self {
            seeds: Arc::new(move || {
                let deal = deals.fetch_add(1, Ordering::Relaxed);
                seed.wrapping_mul(1_000_003).wrapping_add(deal)
            }),
            first_dealer: None,
            strategy: None,
            reactions: Arc::default(),
            observer: Arc::new(NoObserver),
        }
    }

    /// Draws the first dealer of each match from seeds derived from `seed`, one per match, so the same seed gives
    /// the same first dealers (US-139). Tables made with `seeded` alone keep North as the first to speak.
    pub fn with_seeded_first_dealer(mut self, seed: i64) -> Self {
        let matches = Arc::new(AtomicI64::new(0));
        self.first_dealer = Some(Arc::new(move || {
            let started = matches.fetch_add(1, Ordering::Relaxed);
            seed.wrapping_mul(2_000_033).wrapping_add(started)
        }));
        self
    }

    /// Each deal's seed comes from `seeds`.
    pub fn with_seed_source(mut self, seeds: SeedSource) -> Self {
        self.seeds = seeds;
        self
    }

    /// Each match's first dealer is drawn from a seed of `seeds`.
    pub fn with_first_dealer_source(mut self, seeds: SeedSource) -> Self {
        self.first_dealer = Some(seeds);
        self
    }

    /// Reactions take their sequence numbers from this counter, shared by every table.
    pub fn with_reaction_sequence(mut self, sequence: Arc<AtomicU64>) -> Self {
        self.reactions = sequence;
        self
    }

    /// The table tells `observer` when a match begins and ends.
    pub fn with_observer(mut self, observer: Arc<dyn Observer>) -> Self {
        self.observer = observer;
        self
    }

    /// The bots play this strategy instead of the table's own.
    pub fn with_strategy(mut self, strategy: &'static dyn BotStrategy) -> Self {
        self.strategy = Some(strategy);
        self
    }
}

/// Who acts: an online player in their seat, or the one device of a local table, which acts for the human whose
/// turn it is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Actor {
    Seat(usize),
    Device,
    /// Someone watching an online table: they see what the table shows, never a hand, and can do nothing.
    Spectator,
}

/// What an accepted change leaves for the caller: a match to hand to the history, a daily round to score, or a table
/// to remove.
#[derive(Debug, Default)]
pub struct Outcome {
    pub finished: Option<FinishedMatch>,
    pub daily: Option<DailyResult>,
    pub removed: bool,
}

/// How many cards a solo player may take back in one match, and for how long after playing one (US-146).
pub const UNDO_LIMIT: u32 = 3;
const UNDO_WINDOW: time::Duration = time::Duration::seconds(8);

/// The board as it was just before the solo player's last card, with the moment that card was played.
#[derive(Debug, Clone)]
struct UndoPoint {
    board: GameBoard,
    at: OffsetDateTime,
}

/// The first dealer of a match at a table without a random draw: the seat before North, so North speaks first.
const FIRST_DEALER: usize = 3;

/// Where the table stands: waiting for its first deal, in the auction, or playing the cards (the auction stays beside
/// the board: the player sees it, and the next dealer comes from it).
#[derive(Debug)]
#[allow(clippy::large_enum_variant)]
enum Phase {
    Lobby,
    Auction {
        bidding: BiddingState,
    },
    Play {
        bidding: BiddingState,
        board: GameBoard,
    },
}

/// A match in progress or finished: its score and what belongs to it alone.
#[derive(Debug)]
struct MatchState {
    score: MatchScore,
    id: Uuid,
    /// The seats that asked for a rematch of the finished match (US-114); empty once a new match is dealt.
    rematch_votes: Vec<usize>,
    round_recorded: bool,
    /// What an undo returns to, and how many undos the match has used (US-146).
    undo: Option<UndoPoint>,
    undos_used: u32,
}

impl MatchState {
    fn new(score: MatchScore, id: Uuid) -> Self {
        Self {
            score,
            id,
            rematch_votes: Vec::new(),
            round_recorded: false,
            undo: None,
            undos_used: 0,
        }
    }
}

pub struct Table {
    pub id: Uuid,
    pub kind: TableKind,
    pub difficulty: Option<Difficulty>,
    pub invitation_code: Option<String>,
    origin: Origin,
    lobby: Lobby,
    phase: Phase,
    game: Option<MatchState>,
    /// The spectators with an open stream (US-071).
    watching: u32,
    /// The day of the daily deal this table plays (US-150): one round, and its score goes to the day's board.
    daily: Option<time::Date>,
    /// The human in charge of a local device.
    viewer: usize,
    /// Changes with every deal, redeals included; derived from the deal's seed.
    auction_id: Uuid,
    auction_deals: u32,
    deal_seed: i64,
    /// The completed-trick count and since when that trick has been shown, at an online table.
    trick_shown: Option<(usize, OffsetDateTime)>,
    version: u64,
    /// While the table is being made, its events belong to version 0, as the table itself does.
    constructing: bool,
    /// The calls and cards played so far, the bots' included (US-163): a change of presence does not count.
    moves: u64,
    last_activity: OffsetDateTime,
    seeds: SeedSource,
    first_dealer: Option<SeedSource>,
    strategy: &'static dyn BotStrategy,
    reactions: Reactions,
    observer: Arc<dyn Observer>,
    pending: Outcome,
    log: Vec<Entry>,
}

impl std::fmt::Debug for Table {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Table")
            .field("id", &self.id)
            .field("kind", &self.kind)
            .field("lobby", &self.lobby)
            .field("version", &self.version)
            .finish_non_exhaustive()
    }
}

fn conflict(code: &'static str, message: &str) -> Refusal {
    Refusal::conflict(code, message)
}

fn bot_failed(error: GameError) -> Refusal {
    Refusal::Internal(format!("a bot made an illegal move: {error}"))
}

fn auction_error(error: GameError) -> Refusal {
    let message = match error {
        GameError::NotYourTurn => msg::NOT_YOUR_TURN_TO_BID,
        GameError::ContractOnlyInContree => msg::CONTRACT_ONLY_IN_CONTREE,
        GameError::TrumpChoiceOnlyInClassic => msg::TRUMP_CHOICE_ONLY_IN_CLASSIC,
        GameError::AuctionEnded => msg::AUCTION_ENDED,
        GameError::MustTakeUpturnedSuit => msg::MUST_TAKE_UPTURNED_SUIT,
        GameError::MustChooseAnotherSuit => msg::MUST_CHOOSE_ANOTHER_SUIT,
        GameError::InvalidBid => msg::INVALID_BID,
        GameError::BidTooLow => msg::BID_TOO_LOW,
        GameError::CoincheNotAllowed => msg::COINCHE_NOT_ALLOWED,
        GameError::AllTrumpsNotPlayed => msg::ALL_TRUMPS_NOT_PLAYED,
        other => return board_error(other),
    };
    conflict(error.code(), message)
}

fn board_error(error: GameError) -> Refusal {
    let message = match error {
        GameError::NotYourTurn => msg::NOT_YOUR_TURN_TO_PLAY,
        GameError::IllegalCard => msg::ILLEGAL_CARD,
        GameError::RoundEnded => msg::ROUND_ENDED,
        GameError::NoCompletedTrick => msg::NO_COMPLETED_TRICK,
        other => return auction_error(other),
    };
    conflict(error.code(), message)
}

/// The finished round of a solo table, as the review analysis reads it.
#[derive(Debug, Clone)]
pub struct ReviewInput {
    pub tricks: Vec<Vec<beelot_game::board::SeatCard>>,
    pub trump: beelot_game::Trump,
    pub seat: usize,
    pub variant: beelot_game::Variant,
    pub declarer: usize,
}

impl ReviewInput {
    /// Why each bot of the round played its cards (US-149).
    pub fn explanations(&self) -> Vec<PlayReason> {
        let bots: Vec<usize> = (0..4).filter(|&seat| seat != self.seat).collect();
        play_reasons(&self.tricks, self.trump, self.variant, self.declarer, &bots)
    }
}

/// The view a hint is searched from: taken from the table at once, solved later, so that the search can run anywhere.
#[derive(Debug, Clone)]
pub enum HintInput {
    Card(beelot_game::board::PlayView),
    Bid(beelot_game::bidding::AuctionView),
}

impl HintInput {
    /// The Challenging bot's choice for this view. It searches, so it takes a while.
    pub fn solve(self) -> Hint {
        match self {
            Self::Card(view) => {
                let hint = card_hint(&view);
                Hint::Card {
                    card: CardView::from(hint.card),
                    reason: hint.reason,
                }
            }
            Self::Bid(view) => {
                let hint = auction_hint(&view);
                let action = match hint.decision {
                    AuctionDecision::Pass => BidHint::Pass,
                    AuctionDecision::Trump { suit } => BidHint::Trump { suit },
                    AuctionDecision::Bid { value, trump } => {
                        BidHint::Contract { value, suit: trump }
                    }
                    AuctionDecision::Coinche => BidHint::Coinche,
                };
                Hint::Bid {
                    action,
                    reason: hint.reason,
                }
            }
        }
    }
}

impl Table {
    fn new(
        id: Uuid,
        kind: TableKind,
        difficulty: Option<Difficulty>,
        invitation_code: Option<String>,
        lobby: Lobby,
        setup: TableSetup,
        now: OffsetDateTime,
    ) -> Self {
        let strategy = setup.strategy.unwrap_or_else(|| match difficulty {
            Some(difficulty) => strategies::for_difficulty(difficulty),
            None => strategies::for_tables(),
        });
        let viewer = lobby
            .occupied()
            .find(|(_, seat)| seat.kind == SeatKind::Human)
            .map_or(0, |(position, _)| position);
        Self {
            id,
            kind,
            difficulty,
            invitation_code: invitation_code.clone(),
            origin: Origin {
                id,
                kind,
                difficulty,
                invitation_code,
                lobby: lobby.clone(),
                daily: None,
            },
            lobby,
            phase: Phase::Lobby,
            game: None,
            watching: 0,
            daily: None,
            viewer,
            auction_id: Uuid::nil(),
            auction_deals: 0,
            deal_seed: 0,
            trick_shown: None,
            version: 0,
            constructing: false,
            moves: 0,
            last_activity: now,
            seeds: setup.seeds,
            first_dealer: setup.first_dealer,
            strategy,
            reactions: Reactions::new(setup.reactions),
            observer: setup.observer,
            pending: Outcome::default(),
            log: Vec::new(),
        }
    }

    /// A solo or pass-and-play table, dealt at once; its bots play the difficulty's strategy.
    pub fn local(
        id: Uuid,
        difficulty: Difficulty,
        lobby: Lobby,
        setup: TableSetup,
        now: OffsetDateTime,
    ) -> Self {
        let mut table = Self::new(
            id,
            TableKind::Local,
            Some(difficulty),
            None,
            lobby,
            setup,
            now,
        );
        table.constructing = true;
        table
            .begin_match(now)
            .expect("the first deal of a local table");
        table.constructing = false;
        table
    }

    /// A private or public table, waiting for players; its bots play the table strategy.
    pub fn online(
        id: Uuid,
        kind: TableKind,
        invitation_code: Option<String>,
        lobby: Lobby,
        setup: TableSetup,
        now: OffsetDateTime,
    ) -> Self {
        Self::new(id, kind, None, invitation_code, lobby, setup, now)
    }

    /// The table of a day's deal (US-150): a solo table against the Challenging bots, dealt from `seed` with a first
    /// dealer drawn from it, so every player of the day gets the same cards.
    pub fn daily(
        id: Uuid,
        day: time::Date,
        variant: beelot_game::Variant,
        seed: i64,
        account: Option<Uuid>,
        now: OffsetDateTime,
    ) -> Self {
        let mut seats = super::seats::local_seats(None).expect("the default seats");
        seats[0].account = account;
        let mut table = Self::local(
            id,
            Difficulty::Challenging,
            Lobby::local(seats, variant, true, true, 1_000),
            TableSetup::seeded(seed).with_seeded_first_dealer(seed),
            now,
        );
        table.daily = Some(day);
        table.origin.daily = Some(day);
        table
    }

    pub fn lobby(&self) -> &Lobby {
        &self.lobby
    }

    pub fn bidding(&self) -> Option<&BiddingState> {
        match &self.phase {
            Phase::Lobby => None,
            Phase::Auction { bidding } | Phase::Play { bidding, .. } => Some(bidding),
        }
    }

    pub fn board(&self) -> Option<&GameBoard> {
        match &self.phase {
            Phase::Play { board, .. } => Some(board),
            _ => None,
        }
    }

    /// What the table was before its first event; with [`entries`](Self::entries), all it is.
    pub fn origin(&self) -> &Origin {
        &self.origin
    }

    /// Every change of the table so far, in order.
    pub fn entries(&self) -> &[Entry] {
        &self.log
    }

    /// Whether the last card of a solo player can still be taken back, and how many undos the match has left.
    /// The server keeps the time: a late request is refused even while the button is shown.
    pub fn undo_offered(&self) -> bool {
        self.game
            .as_ref()
            .is_some_and(|game| game.undo.is_some() && game.undos_used < UNDO_LIMIT)
    }

    pub fn undos_left(&self) -> u32 {
        if self.kind == TableKind::Local && !self.pass_and_play() {
            UNDO_LIMIT.saturating_sub(self.game.as_ref().map_or(0, |game| game.undos_used))
        } else {
            0
        }
    }

    /// The seats that asked for a rematch of the finished match.
    pub fn rematch_voted(&self) -> &[usize] {
        self.game
            .as_ref()
            .map_or(&[], |game| game.rematch_votes.as_slice())
    }

    /// The connected humans who have not asked for a rematch yet; bots and disconnected seats do not hold it up.
    pub fn rematch_pending(&self) -> Vec<usize> {
        self.lobby
            .occupied()
            .filter(|(position, seat)| {
                !seat.played_by_bot()
                    && seat.connection == Connection::Connected
                    && !self.rematch_voted().contains(position)
            })
            .map(|(position, _)| position)
            .collect()
    }

    pub fn match_score(&self) -> Option<&MatchScore> {
        self.game.as_ref().map(|game| &game.score)
    }

    pub fn auction_id(&self) -> Uuid {
        self.auction_id
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    /// How many calls and cards have been played at this table, the bots' included.
    pub fn moves(&self) -> u64 {
        self.moves
    }

    pub fn last_activity(&self) -> OffsetDateTime {
        self.last_activity
    }

    /// The reactions sent at the table in the last 30 seconds, oldest first.
    pub fn reactions(&self, now: OffsetDateTime) -> Vec<Reaction> {
        self.reactions.recent(now)
    }

    /// Every reaction the table still keeps, with its send time: a reader keeps the ones of the last
    /// [`KEPT_FOR`](super::reactions::KEPT_FOR) at its own `now`.
    pub fn kept_reactions(&self) -> Vec<Reaction> {
        self.reactions.kept()
    }

    pub fn strategy(&self) -> &'static dyn BotStrategy {
        self.strategy
    }

    /// Whether several humans share the device of a local table.
    pub fn pass_and_play(&self) -> bool {
        self.kind == TableKind::Local
            && self
                .lobby
                .occupied()
                .filter(|(_, seat)| seat.kind == SeatKind::Human)
                .count()
                > 1
    }

    /// Whether a bot that may search sampled deals, which takes a while, may move during the next change: any strategy
    /// but the Relaxed one, which answers at once.
    pub fn needs_blocking_bot(&self) -> bool {
        !std::ptr::addr_eq(
            self.strategy,
            strategies::for_difficulty(Difficulty::Relaxed),
        ) && self.lobby.occupied().any(|(_, seat)| seat.played_by_bot())
    }

    /// The card or the call the Challenging bot would choose for the human whose turn it is (US-065). A hint is a
    /// question: it changes nothing, not even the version. Only local tables give them.
    pub fn hint(&self, actor: Actor) -> Result<Hint, Refusal> {
        self.hint_input(actor).map(HintInput::solve)
    }

    /// What [`hint`](Self::hint) searches from: the view of the human whose turn it is. Cheap; the search is
    /// [`HintInput::solve`].
    pub fn hint_input(&self, actor: Actor) -> Result<HintInput, Refusal> {
        if self.kind != TableKind::Local {
            return Err(Refusal::NotFound);
        }
        let no_hint = || conflict("no-hint", msg::NO_HINT);
        if let Some(board) = self.board() {
            if board.round_result().is_some() || board.reviewing_completed_trick() {
                return Err(no_hint());
            }
            let seat = self
                .mover(actor, board.active_seat())
                .map_err(|_| no_hint())?;
            let view = board.play_view(seat);
            if view.legal_cards.is_empty() {
                return Err(no_hint());
            }
            return Ok(HintInput::Card(view));
        }
        let bidding = self.bidding().ok_or_else(no_hint)?;
        let seat = self
            .mover(actor, bidding.active_seat())
            .map_err(|_| no_hint())?;
        Ok(HintInput::Bid(bidding.auction_view(seat)))
    }

    /// What an owner needs to invite a friend (US-070): the table and its invitation code. Only the owner of a private
    /// table that is still waiting may invite.
    pub fn invitation(&self, actor: Actor) -> Result<(Uuid, String), Refusal> {
        let refused = || conflict("invite-owner-only", msg::INVITE_OWNER_ONLY);
        let seat = self.seat_of(actor)?;
        if self.kind != TableKind::Private
            || seat != self.lobby.owner()
            || self.lobby.status() != Status::WaitingForPlayers
        {
            return Err(refused());
        }
        let code = self.invitation_code.clone().ok_or_else(refused)?;
        Ok((self.id, code))
    }

    /// What the analysis of the finished round needs (US-067): its tricks, the trump and the one human's seat. Only a
    /// solo table has a single human, and only once the round is over.
    pub fn review_input(&self, actor: Actor) -> Result<ReviewInput, Refusal> {
        let no_review = || conflict("no-review", msg::NO_REVIEW);
        if self.kind != TableKind::Local {
            return Err(Refusal::NotFound);
        }
        self.seat_of(actor)?;
        let board = self.board().ok_or_else(no_review)?;
        let summary = board.round_summary().ok_or_else(no_review)?;
        let humans: Vec<usize> = (0..4)
            .filter(|&seat| {
                self.lobby
                    .seat(seat)
                    .is_some_and(|held| !held.played_by_bot())
            })
            .collect();
        let [seat] = humans[..] else {
            return Err(no_review());
        };
        Ok(ReviewInput {
            tricks: board
                .review()
                .into_iter()
                .map(|trick| trick.cards)
                .collect(),
            trump: summary.trump,
            seat,
            variant: board.variant(),
            declarer: board.declarer(),
        })
    }

    /// Why each bot of a finished solo round played its cards (US-149), from the bots' own views. Only the table's one
    /// human may ask, and only once the round is over.
    pub fn explanations(&self, actor: Actor) -> Result<Vec<PlayReason>, Refusal> {
        Ok(self.review_input(actor)?.explanations())
    }

    /// Marks the table as used now, so it isn't evicted as idle.
    pub fn touch(&mut self, now: OffsetDateTime) {
        self.last_activity = now;
    }

    /// How many spectators are watching now.
    pub fn watching(&self) -> u32 {
        self.watching
    }

    /// A spectator's stream opened or closed: the players see the new count.
    pub fn watcher_changed(&mut self, joined: bool) {
        let at = self.last_activity;
        self.emit(at, Event::WatcherChanged { joined })
            .expect("a watcher always changes the count");
        self.version += 1;
    }

    fn changed(&mut self) -> Outcome {
        self.version += 1;
        std::mem::take(&mut self.pending)
    }

    /// Applies a player's action. Every accepted change is a new version; a refusal or a no-op changes nothing.
    pub fn apply(
        &mut self,
        actor: Actor,
        action: Action,
        now: OffsetDateTime,
    ) -> Result<Outcome, Refusal> {
        if actor == Actor::Spectator {
            return Err(conflict("spectator", msg::SPECTATOR_READ_ONLY));
        }
        let changed = self.dispatch(actor, action, now)?;
        self.last_activity = now;
        if !changed {
            return Ok(Outcome::default());
        }
        Ok(self.changed())
    }

    /// Rebuilds a table from its origin and its entries. No bot plays and nothing is drawn: every deal, call and card
    /// is in the events, so `setup` only gives the table what it needs to go on afterwards.
    pub fn replay(origin: &Origin, setup: TableSetup, entries: &[Entry]) -> Result<Self, Refusal> {
        let at = entries
            .first()
            .map_or(OffsetDateTime::UNIX_EPOCH, |entry| entry.at);
        let mut table = Self::new(
            origin.id,
            origin.kind,
            origin.difficulty,
            origin.invitation_code.clone(),
            origin.lobby.clone(),
            setup,
            at,
        );
        table.daily = origin.daily;
        table.origin.daily = origin.daily;
        for entry in entries {
            table.apply_event(entry.at, &entry.event)?;
            table.log.push(entry.clone());
            table.version = entry.version;
            table.last_activity = entry.at;
        }
        table.pending = Outcome::default();
        Ok(table)
    }

    /// Applies the event and, once it was accepted, keeps it. A refused event changes nothing and is not kept.
    fn emit(&mut self, at: OffsetDateTime, event: Event) -> Result<(), Refusal> {
        self.apply_event(at, &event)?;
        let version = if self.constructing {
            self.version
        } else {
            self.version + 1
        };
        self.log.push(Entry { version, at, event });
        Ok(())
    }

    /// The only code that changes the table. It is deterministic: it never asks a bot, never draws a number and
    /// reads no clock, only `at`.
    fn apply_event(&mut self, at: OffsetDateTime, event: &Event) -> Result<(), Refusal> {
        match event {
            Event::Joined { name, account } => {
                self.lobby.join(name.clone(), *account)?;
            }
            Event::Left { seat } => {
                if self.kind == TableKind::Local {
                    self.pending.removed = true;
                } else {
                    self.lobby.leave(*seat)?;
                    self.pending.removed = self.lobby.is_empty();
                }
                self.forfeit_undo();
            }
            Event::SeatChosen { seat, to } => {
                self.lobby.choose_seat(*seat, *to)?;
            }
            Event::ReadySet { seat, ready } => self.lobby.set_ready(*seat, *ready)?,
            Event::Started {
                seat,
                fill_with_bots,
            } => {
                if *fill_with_bots {
                    self.lobby.start_with_bots(*seat)?;
                } else {
                    self.lobby.start(*seat)?;
                }
            }
            Event::BotsFilled => {
                if !self.lobby.fill_with_bots_if_due(at) {
                    return Err(Refusal::Internal("the bots were not due".into()));
                }
            }
            Event::SettingsChanged {
                seat,
                announcements,
                all_trumps,
                turn_timer,
                target,
            } => {
                // Every setting is checked before any changes.
                let mut lobby = self.lobby.clone();
                if let Some(on) = announcements {
                    lobby.set_announcements(*seat, *on)?;
                }
                if let Some(on) = all_trumps {
                    lobby.set_all_trumps(*seat, *on)?;
                }
                if let Some(seconds) = turn_timer {
                    lobby.set_turn_timer(*seat, *seconds)?;
                }
                if let Some(target) = target {
                    lobby.set_target(*seat, *target)?;
                }
                self.lobby = lobby;
            }
            Event::SpectatorsSet { seat, allowed } => self.lobby.set_spectators(*seat, *allowed)?,
            Event::Disconnected { seat } => self.lobby.disconnect(*seat, at)?,
            Event::Reconnected { seat } => self.lobby.reconnect(*seat)?,
            Event::BotsTookOver { timeout_ms } => {
                self.lobby
                    .replace_expired_disconnections(at, Duration::from_millis(*timeout_ms));
            }
            Event::AccountReleased { account } => self.release_seats(*account)?,
            Event::WatcherChanged { joined } => {
                self.watching = if *joined {
                    self.watching + 1
                } else {
                    self.watching.saturating_sub(1)
                };
            }
            Event::MatchBegan { match_id } => {
                self.game = Some(MatchState::new(self.new_match_score(), *match_id));
                self.observer.match_started(self.kind);
            }
            Event::Rematched { match_id } => {
                self.game = Some(MatchState::new(self.new_match_score(), *match_id));
            }
            Event::Dealt {
                dealer,
                seed,
                from_pile,
            } => self.deal(*dealer, *seed, *from_pile),
            Event::Called {
                seat,
                decision,
                by_bot,
            } => {
                let Phase::Auction { bidding } = &mut self.phase else {
                    return Err(auction_error(GameError::AuctionEnded));
                };
                bidding.apply(*seat, *decision).map_err(|error| {
                    if *by_bot {
                        bot_failed(error)
                    } else {
                        auction_error(error)
                    }
                })?;
                let deals = bidding.deals();
                let board = bidding.completed_board().cloned();
                self.moves += 1;
                self.forfeit_undo();
                if deals != self.auction_deals {
                    self.auction_deals = deals;
                    self.auction_id = deal_id(self.deal_seed, deals);
                }
                if let Some(board) = board {
                    let Phase::Auction { bidding } =
                        std::mem::replace(&mut self.phase, Phase::Lobby)
                    else {
                        unreachable!("the phase was the auction");
                    };
                    self.phase = Phase::Play { bidding, board };
                }
            }
            Event::CardPlayed {
                seat,
                card,
                declare,
                by_bot,
            } => {
                let local_solo = self.kind == TableKind::Local && !self.pass_and_play();
                let Phase::Play { board, .. } = &mut self.phase else {
                    return Err(conflict("auction-not-finished", msg::AUCTION_NOT_FINISHED));
                };
                let before = board.clone();
                board.play(*seat, *card, *declare).map_err(|error| {
                    if *by_bot {
                        bot_failed(error)
                    } else {
                        board_error(error)
                    }
                })?;
                self.moves += 1;
                // A card that ends the round is final: the score is already counted.
                let round_over = board.round_result().is_some();
                if let Some(game) = self.game.as_mut() {
                    if round_over {
                        game.undo = None;
                    } else if !*by_bot {
                        game.undo = local_solo.then_some(UndoPoint { board: before, at });
                    }
                }
                self.stamp_trick_review(at);
                self.record_round_if_complete(at);
            }
            Event::TrickCollected => {
                let Phase::Play { board, .. } = &mut self.phase else {
                    return Err(conflict("auction-not-finished", msg::AUCTION_NOT_FINISHED));
                };
                board.continue_after_trick().map_err(board_error)?;
                self.forfeit_undo();
                self.stamp_trick_review(at);
                self.record_round_if_complete(at);
            }
            Event::CardTakenBack => {
                let point = self
                    .game
                    .as_mut()
                    .and_then(|game| game.undo.take())
                    .ok_or_else(|| conflict("undo-unavailable", msg::UNDO_UNAVAILABLE))?;
                let Phase::Play { board, .. } = &mut self.phase else {
                    return Err(conflict("undo-unavailable", msg::UNDO_UNAVAILABLE));
                };
                *board = point.board;
                if let Some(game) = self.game.as_mut() {
                    game.undos_used += 1;
                }
                self.trick_shown = None;
            }
            Event::RematchAsked { seat } => {
                if let Some(game) = self.game.as_mut() {
                    game.rematch_votes.push(*seat);
                }
            }
            Event::Reacted {
                seat,
                reaction,
                sequence,
            } => self.reactions.insert(*seat, *reaction, at, *sequence),
        }
        self.refresh_viewer();
        Ok(())
    }

    /// Anything but a card makes the last card final (US-146).
    fn forfeit_undo(&mut self) {
        if let Some(game) = self.game.as_mut() {
            game.undo = None;
        }
    }

    /// Deals a new auction: shuffled from `seed`, or from the last round's tricks. Every deal of the table keeps its
    /// variant and its options.
    fn deal(&mut self, dealer: usize, seed: i64, from_pile: bool) {
        let deck = if from_pile {
            self.board().and_then(|board| board.gathered_deck(dealer))
        } else {
            None
        };
        let bidding = BiddingState::dealt_from(
            self.lobby.variant(),
            dealer,
            Box::new(SplitMix64::new(seed)),
            deck,
        )
        .with_announcements(self.lobby.announcements())
        .with_all_trumps(self.lobby.all_trumps());
        self.auction_deals = bidding.deals();
        self.deal_seed = seed;
        self.auction_id = deal_id(seed, self.auction_deals);
        self.phase = Phase::Auction { bidding };
        if let Some(game) = self.game.as_mut() {
            game.round_recorded = false;
            game.rematch_votes.clear();
            game.undo = None;
        }
        self.trick_shown = None;
    }

    /// Takes a deleted account away from the table: it leaves a table still waiting for players, and a bot plays its
    /// seat, as "Deleted player", in a match.
    fn release_seats(&mut self, account: Uuid) -> Result<(), Refusal> {
        let seats: Vec<usize> = self
            .lobby
            .occupied()
            .filter(|(_, seat)| seat.account == Some(account))
            .map(|(position, _)| position)
            .collect();
        for position in seats {
            if self.lobby.status() == Status::WaitingForPlayers {
                self.lobby.leave(position)?;
            } else {
                let seat = self.lobby.seat_mut(position).ok_or(Refusal::NotSeated)?;
                seat.account = None;
                if self.kind != TableKind::Local {
                    self.lobby.hand_to_bot(position, DELETED_PLAYER)?;
                }
            }
        }
        self.pending.removed = self.lobby.is_empty();
        Ok(())
    }

    fn seat_of(&self, actor: Actor) -> Result<usize, Refusal> {
        match (actor, self.kind) {
            (Actor::Seat(position), TableKind::Private | TableKind::Public) => Ok(position),
            (Actor::Device, TableKind::Local) => Ok(self.viewer),
            _ => Err(Refusal::NotSeated),
        }
    }

    /// The seat that makes a move: an online player's own, or the human whose turn it is on a local device.
    fn mover(&self, actor: Actor, active: usize) -> Result<usize, Refusal> {
        match actor {
            Actor::Device => {
                self.seat_of(actor)?;
                match self.lobby.seat(active) {
                    Some(seat) if !seat.played_by_bot() => Ok(active),
                    _ => Err(conflict("not-your-turn", msg::NOT_YOUR_TURN)),
                }
            }
            Actor::Seat(_) | Actor::Spectator => self.seat_of(actor),
        }
    }

    fn dispatch(
        &mut self,
        actor: Actor,
        action: Action,
        now: OffsetDateTime,
    ) -> Result<bool, Refusal> {
        match action {
            Action::Ready { ready } => {
                let seat = self.seat_of(actor)?;
                self.emit(now, Event::ReadySet { seat, ready })?;
            }
            Action::Seat { position } => {
                let seat = self.seat_of(actor)?;
                self.emit(now, Event::SeatChosen { seat, to: position })?;
            }
            Action::Start { fill_with_bots } => {
                let seat = self.seat_of(actor)?;
                self.emit(
                    now,
                    Event::Started {
                        seat,
                        fill_with_bots,
                    },
                )?;
                self.begin_match(now)?;
            }
            Action::Settings {
                announcements,
                all_trumps,
                turn_timer,
                target,
            } => {
                let seat = self.seat_of(actor)?;
                if announcements.is_none()
                    && all_trumps.is_none()
                    && turn_timer.is_none()
                    && target.is_none()
                {
                    return Ok(false);
                }
                self.emit(
                    now,
                    Event::SettingsChanged {
                        seat,
                        announcements,
                        all_trumps,
                        turn_timer,
                        target,
                    },
                )?;
            }
            Action::Spectators { allowed } => {
                let seat = self.seat_of(actor)?;
                self.emit(now, Event::SpectatorsSet { seat, allowed })?;
            }
            Action::Pass => self.auction(actor, now, AuctionDecision::Pass)?,
            Action::Trump { suit } => self.auction(actor, now, AuctionDecision::Trump { suit })?,
            Action::Contract { value, suit } => {
                let trump = suit.ok_or_else(|| conflict("suit-required", msg::SUIT_REQUIRED))?;
                self.auction(actor, now, AuctionDecision::Bid { value, trump })?
            }
            Action::Coinche => self.auction(actor, now, AuctionDecision::Coinche)?,
            Action::Card {
                rank,
                suit,
                declare,
            } => {
                let board = self.started_board()?;
                let seat = self.mover(actor, board.active_seat())?;
                let rank = Rank::ALL
                    .into_iter()
                    .find(|candidate| candidate.label() == rank)
                    .ok_or_else(|| board_error(GameError::IllegalCard))?;
                self.emit(
                    now,
                    Event::CardPlayed {
                        seat,
                        card: Card::new(rank, suit),
                        declare: declare.unwrap_or(false),
                        by_bot: false,
                    },
                )?;
                self.drive_bots(now)?;
            }
            Action::Undo => {
                self.seat_of(actor)?;
                if self.kind != TableKind::Local || self.pass_and_play() {
                    return Err(conflict("undo-unavailable", msg::UNDO_UNAVAILABLE));
                }
                let game = self.game.as_ref();
                let Some(point) = game.and_then(|game| game.undo.as_ref()) else {
                    return Err(conflict("undo-unavailable", msg::UNDO_UNAVAILABLE));
                };
                if game.is_some_and(|game| game.undos_used >= UNDO_LIMIT) {
                    return Err(conflict("undo-limit", msg::UNDO_LIMIT_REACHED));
                }
                if now - point.at > UNDO_WINDOW {
                    return Err(conflict("undo-too-late", msg::UNDO_TOO_LATE));
                }
                self.emit(now, Event::CardTakenBack)?;
            }
            Action::ContinueTrick => {
                self.seat_of(actor)?;
                self.started_board()?;
                self.emit(now, Event::TrickCollected)?;
                self.drive_bots(now)?;
            }
            Action::NextRound => {
                self.seat_of(actor)?;
                if self.daily.is_some() {
                    return Err(conflict("daily-over", msg::DAILY_OVER));
                }
                let score = self
                    .match_score()
                    .ok_or_else(|| conflict("not-started", msg::NOT_STARTED))?;
                if score.complete() {
                    return Err(conflict("match-ended", msg::MATCH_ENDED));
                }
                return self.deal_next_round(now, true);
            }
            Action::Rematch => {
                let seat = self.seat_of(actor)?;
                let score = self
                    .match_score()
                    .ok_or_else(|| conflict("not-started", msg::NOT_STARTED))?;
                if !score.complete() {
                    return Ok(false);
                }
                // Online, a rematch is proposed to the table: it starts once every connected human has asked for it.
                if self.kind != TableKind::Local {
                    if self.rematch_voted().contains(&seat) {
                        return Ok(false);
                    }
                    self.emit(now, Event::RematchAsked { seat })?;
                    if !self.rematch_pending().is_empty() {
                        return Ok(true);
                    }
                }
                self.emit(
                    now,
                    Event::Rematched {
                        match_id: Uuid::new_v4(),
                    },
                )?;
                self.deal_next_round(now, false)?;
            }
            Action::React { reaction } => {
                let seat = self.seat_of(actor)?;
                if self.kind == TableKind::Local || self.lobby.status() != Status::InProgress {
                    return Err(conflict("reactions-closed", msg::REACTIONS_CLOSED));
                }
                self.reactions.check(seat, now)?;
                let sequence = self.reactions.next_sequence();
                self.emit(
                    now,
                    Event::Reacted {
                        seat,
                        reaction,
                        sequence,
                    },
                )?;
            }
            Action::Leave => {
                let seat = self.seat_of(actor)?;
                self.emit(now, Event::Left { seat })?;
            }
        }
        Ok(true)
    }

    /// A call in the auction, from the seat that makes it; the bots then take their turns.
    fn auction(
        &mut self,
        actor: Actor,
        now: OffsetDateTime,
        decision: AuctionDecision,
    ) -> Result<(), Refusal> {
        let active = match &self.phase {
            Phase::Lobby => return Err(conflict("not-started", msg::NOT_STARTED)),
            Phase::Play { .. } => return Err(auction_error(GameError::AuctionEnded)),
            Phase::Auction { bidding } => bidding.active_seat(),
        };
        let seat = self.mover(actor, active)?;
        self.emit(
            now,
            Event::Called {
                seat,
                decision,
                by_bot: false,
            },
        )?;
        self.drive_bots(now)
    }

    fn started_board(&self) -> Result<&GameBoard, Refusal> {
        match &self.phase {
            Phase::Lobby => Err(conflict("not-started", msg::NOT_STARTED)),
            Phase::Auction { .. } => {
                Err(conflict("auction-not-finished", msg::AUCTION_NOT_FINISHED))
            }
            Phase::Play { board, .. } => Ok(board),
        }
    }

    /// A match to the table's target: the next round and a rematch keep it.
    fn new_match_score(&self) -> MatchScore {
        MatchScore::to(self.lobby.target()).expect("the lobby holds a valid target")
    }

    fn begin_match(&mut self, now: OffsetDateTime) -> Result<(), Refusal> {
        self.emit(
            now,
            Event::MatchBegan {
                match_id: Uuid::new_v4(),
            },
        )?;
        // Anyone can open a match: the first dealer is drawn, the seat to their left speaks first (US-139).
        let dealer = self.first_dealer.as_ref().map_or(FIRST_DEALER, |draw| {
            usize::try_from(SplitMix64::new(draw()).next_int(4)).unwrap_or(FIRST_DEALER) % 4
        });
        let seed = (self.seeds)();
        self.emit(
            now,
            Event::Dealt {
                dealer,
                seed,
                from_pile: false,
            },
        )?;
        self.drive_bots(now)
    }

    /// Deals the next round once the current one is finished. Within a match, its cards are gathered without a
    /// shuffle (US-085); a rematch starts from a shuffled deck. Several players may click at once, so a call made
    /// after the new deal has already happened is a no-op.
    fn deal_next_round(&mut self, now: OffsetDateTime, same_match: bool) -> Result<bool, Refusal> {
        let Some(board) = self.board() else {
            return Ok(false);
        };
        if board.round_result().is_none() {
            return Err(conflict("round-not-finished", msg::ROUND_NOT_FINISHED));
        }
        let dealer = (self.bidding().map_or(FIRST_DEALER, BiddingState::dealer) + 1) % 4;
        let seed = (self.seeds)();
        self.emit(
            now,
            Event::Dealt {
                dealer,
                seed,
                from_pile: same_match,
            },
        )?;
        self.drive_bots(now)?;
        Ok(true)
    }

    /// Bots take their turns until a human's turn, a completed trick or the end of the round; each call and card is
    /// an event, and a finished round is added to the match score once.
    fn drive_bots(&mut self, now: OffsetDateTime) -> Result<(), Refusal> {
        while let Phase::Auction { bidding } = &self.phase {
            let seat = bidding.active_seat();
            if bidding.completed_board().is_some()
                || !self.lobby.seat(seat).is_some_and(Seat::played_by_bot)
            {
                break;
            }
            let decision = self.strategy.decide_auction(&bidding.auction_view(seat));
            self.emit(
                now,
                Event::Called {
                    seat,
                    decision,
                    by_bot: true,
                },
            )?;
        }
        while let Phase::Play { board, .. } = &self.phase {
            let seat = board.active_seat();
            if board.round_result().is_some()
                || board.reviewing_completed_trick()
                || !self.lobby.seat(seat).is_some_and(Seat::played_by_bot)
            {
                break;
            }
            let view = board.play_view(seat);
            if view.legal_cards.is_empty() {
                return Err(bot_failed(GameError::IllegalCard));
            }
            let card = self.strategy.choose_card(&view);
            // Bots always declare their announcements (US-060).
            self.emit(
                now,
                Event::CardPlayed {
                    seat,
                    card,
                    declare: true,
                    by_bot: true,
                },
            )?;
        }
        Ok(())
    }

    fn stamp_trick_review(&mut self, now: OffsetDateTime) {
        let shown = self.board().filter(|board| {
            self.kind != TableKind::Local
                && board.reviewing_completed_trick()
                && board.round_result().is_none()
        });
        self.trick_shown = match (shown, self.trick_shown) {
            (Some(board), Some((count, since))) if count == board.completed_tricks() => {
                Some((count, since))
            }
            (Some(board), _) => Some((board.completed_tricks(), now)),
            (None, _) => None,
        };
    }

    /// Adds a finished round to the match score once, and hands the match over when it ends. Pass-and-play matches
    /// are never handed over: their players cannot be told apart.
    fn record_round_if_complete(&mut self, now: OffsetDateTime) {
        let pass_and_play = self.pass_and_play();
        let account = self.lobby.seat(0).and_then(|seat| seat.account);
        let Phase::Play { board, .. } = &self.phase else {
            return;
        };
        let Some(game) = self.game.as_mut() else {
            return;
        };
        if game.round_recorded {
            return;
        }
        let Some(round) = board.round_summary() else {
            return;
        };
        game.round_recorded = true;
        let points = round.result.north_south_awarded;
        let complete = game.score.record_summary(round);
        if let (Some(day), Some(account)) = (self.daily, account) {
            self.pending.daily = Some(DailyResult {
                day,
                account,
                score: points,
            });
        }
        if complete && !pass_and_play {
            self.observer.match_completed(self.kind);
            self.pending.finished = Some(self.finished_match(now));
        }
    }

    fn finished_match(&self, now: OffsetDateTime) -> FinishedMatch {
        let game = self.game.as_ref().expect("a match was played");
        let score = &game.score;
        FinishedMatch {
            id: game.id,
            ended_at: now,
            mode: match self.kind {
                TableKind::Local => Mode::Solo,
                TableKind::Private => Mode::Private,
                TableKind::Public => Mode::Public,
            },
            variant: self.lobby.variant(),
            difficulty: self.difficulty,
            north_south_score: score.north_south(),
            east_west_score: score.east_west(),
            winning_team: score.winner().expect("a complete match has a winner"),
            seats: self
                .lobby
                .occupied()
                .map(|(_, seat)| FinishedSeat {
                    account: seat.account,
                    name: seat.name.clone(),
                    bot: seat.played_by_bot(),
                })
                .collect(),
            rounds: score.rounds().to_vec(),
            announcements: self.lobby.announcements(),
            all_trumps: self.lobby.all_trumps(),
            target: score.target(),
            undos: game.undos_used,
        }
    }

    /// The human in charge of a local device: the active player when that is a human and no completed trick is on
    /// the table, otherwise the human who was in charge before.
    pub fn viewer(&self) -> usize {
        let active = match (self.board(), self.bidding()) {
            (Some(board), _) => board.active_seat(),
            (None, Some(bidding)) => bidding.active_seat(),
            (None, None) => return self.viewer,
        };
        let trick_shown = self.board().is_some_and(|board| {
            board.round_result().is_some() || board.reviewing_completed_trick()
        });
        let human = self
            .lobby
            .seat(active)
            .is_some_and(|seat| seat.kind == SeatKind::Human);
        if human && !trick_shown {
            active
        } else {
            self.viewer
        }
    }

    fn refresh_viewer(&mut self) {
        self.viewer = self.viewer();
    }

    /// Seats a player at an online table; the fourth player at a public table starts the match.
    pub fn join(
        &mut self,
        name: String,
        account: Option<Uuid>,
        now: OffsetDateTime,
    ) -> Result<usize, Refusal> {
        let position = self.lobby.clone().join(name.clone(), account)?;
        self.emit(now, Event::Joined { name, account })?;
        self.last_activity = now;
        if self.lobby.status() == Status::InProgress {
            self.begin_match(now)?;
        }
        self.changed();
        Ok(position)
    }

    /// Starts a waiting public table with bots once its deadline has passed; true when it did.
    pub fn fill_with_bots_if_due(&mut self, now: OffsetDateTime) -> bool {
        if !self.lobby.clone().fill_with_bots_if_due(now) {
            return false;
        }
        if let Err(error) = self.emit(now, Event::BotsFilled) {
            tracing::warn!(table = %self.id, %error, "the bots could not take the seats");
            return false;
        }
        if let Err(error) = self.begin_match(now) {
            tracing::warn!(table = %self.id, %error, "the bots could not begin the match");
        }
        self.changed();
        true
    }

    pub fn disconnect(&mut self, position: usize, now: OffsetDateTime) -> Result<(), Refusal> {
        self.emit(now, Event::Disconnected { seat: position })?;
        self.changed();
        Ok(())
    }

    /// A table brought back after a restart: no stream is open, so every human seat is disconnected from `now`, which
    /// is when a bot's takeover timeout starts, and nobody is watching.
    pub fn restarted(&mut self, now: OffsetDateTime) {
        self.watching = 0;
        if self.kind == TableKind::Local {
            return;
        }
        let humans: Vec<usize> = self
            .lobby
            .occupied()
            .filter(|(_, seat)| {
                seat.kind == SeatKind::Human && seat.connection == Connection::Connected
            })
            .map(|(position, _)| position)
            .collect();
        for position in humans {
            let _ = self.disconnect(position, now);
        }
    }

    /// Clears the account of every seat for which `forgotten` says so: it no longer exists.
    pub fn forget_accounts(&mut self, forgotten: impl Fn(Uuid) -> bool) {
        self.lobby.forget_accounts(forgotten);
    }

    /// Marks the seat connected again; a seat already connected changes nothing.
    pub fn reconnect(&mut self, position: usize) -> Result<(), Refusal> {
        if self
            .lobby
            .seat(position)
            .is_some_and(|seat| seat.connection == Connection::Connected)
        {
            return Ok(());
        }
        let at = self.last_activity;
        self.emit(at, Event::Reconnected { seat: position })?;
        self.changed();
        Ok(())
    }

    /// Hands to bots the seats disconnected for at least `timeout`; the bots then play any turn they now hold.
    pub fn replace_expired_disconnections(
        &mut self,
        now: OffsetDateTime,
        timeout: Duration,
    ) -> Option<Outcome> {
        if !self
            .lobby
            .clone()
            .replace_expired_disconnections(now, timeout)
        {
            return None;
        }
        let timeout_ms = u64::try_from(timeout.as_millis()).unwrap_or(u64::MAX);
        self.emit(now, Event::BotsTookOver { timeout_ms }).ok()?;
        if let Err(error) = self.drive_bots(now) {
            tracing::warn!(table = %self.id, %error, "the bots could not take over");
        }
        Some(self.changed())
    }

    /// The earliest moment something at this online table is due: the bots of a waiting public table, a disconnected
    /// seat's takeover, the collection of a shown trick. A local table has none.
    pub fn next_deadline(
        &self,
        reconnect_timeout: Duration,
        trick_review: Duration,
    ) -> Option<OffsetDateTime> {
        if self.kind == TableKind::Local {
            return None;
        }
        let bots = self
            .lobby
            .bot_fill_at()
            .filter(|_| !self.lobby.is_empty() && self.lobby.status() == Status::WaitingForPlayers);
        let takeovers = self
            .lobby
            .occupied()
            .filter_map(|(_, seat)| match seat.connection {
                Connection::Disconnected { since } => Some(since + reconnect_timeout),
                _ => None,
            });
        let trick = self.trick_shown.and_then(|(count, since)| {
            let board = self.board()?;
            (board.reviewing_completed_trick()
                && board.round_result().is_none()
                && board.completed_tricks() == count)
                .then(|| since + trick_review)
        });
        bots.into_iter().chain(takeovers).chain(trick).min()
    }

    /// What is due at `now` at an online table: bots fill a public table, take the seats disconnected for too long,
    /// and a trick shown long enough is collected. Returns what the changes left.
    pub fn tick(
        &mut self,
        now: OffsetDateTime,
        reconnect_timeout: Duration,
        trick_review: Duration,
    ) -> Vec<Outcome> {
        let mut outcomes = Vec::new();
        if self.kind == TableKind::Local {
            return outcomes;
        }
        self.fill_with_bots_if_due(now);
        outcomes.extend(self.replace_expired_disconnections(now, reconnect_timeout));
        if let Some(count) = self.trick_review_due(now, trick_review) {
            outcomes.extend(self.collect_trick(count, now));
        }
        outcomes
    }

    /// While an online table shows a completed trick for at least `review`, the count of completed tricks.
    pub fn trick_review_due(&self, now: OffsetDateTime, review: Duration) -> Option<usize> {
        let (count, since) = self.trick_shown?;
        let board = self.board()?;
        let shown = board.reviewing_completed_trick()
            && board.round_result().is_none()
            && board.completed_tricks() == count;
        (shown && since + review <= now).then_some(count)
    }

    /// Collects the completed trick, unless another one is shown by now; the bots then play up to a human's turn.
    pub fn collect_trick(
        &mut self,
        expected_tricks: usize,
        now: OffsetDateTime,
    ) -> Option<Outcome> {
        let board = self.board()?;
        if !board.reviewing_completed_trick() || board.completed_tricks() != expected_tricks {
            return None;
        }
        self.emit(now, Event::TrickCollected).ok()?;
        if let Err(error) = self.drive_bots(now) {
            tracing::warn!(table = %self.id, %error, "the bots could not play after the trick");
        }
        Some(self.changed())
    }

    /// Takes a deleted account away from the table: it leaves a table still waiting for players, and a bot plays its
    /// seat, as "Deleted player", in a match. The match finished afterwards is recorded without it.
    pub fn release_account(&mut self, account: Uuid, now: OffsetDateTime) -> Outcome {
        if !self
            .lobby
            .occupied()
            .any(|(_, seat)| seat.account == Some(account))
        {
            return Outcome::default();
        }
        if let Err(error) = self.emit(now, Event::AccountReleased { account }) {
            tracing::warn!(table = %self.id, %error, "the account could not be released");
            return Outcome::default();
        }
        if self.lobby.status() == Status::InProgress
            && let Err(error) = self.drive_bots(now)
        {
            tracing::warn!(table = %self.id, %error, "the bots could not take over");
        }
        self.changed()
    }
}

/// The id of a deal, derived from its seed and from the count of deals of the auction (a redeal after four passes is
/// another deal), so that a table rebuilt from its events has the same ids.
fn deal_id(seed: i64, deals: u32) -> Uuid {
    Uuid::from_u64_pair(seed as u64, u64::from(deals))
}
