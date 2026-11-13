//! One table: its seats, the auction or the card play, the match score, and the bots that play their turns. Solo,
//! pass-and-play and online tables are all this one model; they differ by their seats and their kind.
//!
//! The game flow of a table.

use std::sync::Arc;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::time::Duration;

use beelot_game::bidding::AuctionDecision;
use beelot_game::bidding::BiddingState;
use beelot_game::board::GameBoard;
use beelot_game::bot::hints::{auction_hint, card_hint};
use beelot_game::bot::review::{PlayReason, play_reasons};
use beelot_game::bot::{BotStrategy, strategies, turns};
use beelot_game::deck::Deck;
use beelot_game::match_score::MatchScore;
use beelot_game::{Card, Difficulty, GameError, RandomSource, Rank, SplitMix64};
use time::OffsetDateTime;
use uuid::Uuid;

use super::OsRandom;
use super::actions::Action;
use super::daily::DailyResult;
use super::finished::{DELETED_PLAYER, FinishedMatch, FinishedSeat, Mode};
use super::hints::{BidHint, Hint};
use super::messages as msg;
use super::reactions::{Reaction, Reactions};
use super::seats::{Connection, Lobby, Seat, SeatKind, Status, TableKind};
use crate::api::snapshot::CardView;
use crate::error::AppError;

/// Makes the random source of each new deal.
pub type RngFactory = Arc<dyn Fn() -> Box<dyn RandomSource + Send> + Send + Sync>;

/// How a table deals and which strategy its bots play. Production deals from the operating system's generator.
#[derive(Clone)]
pub struct TableSetup {
    rng: RngFactory,
    /// Draws the first dealer of each match; without one, a match starts with `FIRST_DEALER`, so that seeded
    /// tables keep the deals the tests replay.
    first_dealer: Option<RngFactory>,
    strategy: Option<&'static dyn BotStrategy>,
    reactions: Arc<AtomicU64>,
}

impl Default for TableSetup {
    fn default() -> Self {
        Self {
            rng: Arc::new(|| Box::new(OsRandom)),
            first_dealer: Some(Arc::new(|| Box::new(OsRandom))),
            strategy: None,
            reactions: Arc::default(),
        }
    }
}

impl TableSetup {
    /// Deals from generators seeded from `seed`, one per deal, so tests replay the same deals.
    pub fn seeded(seed: i64) -> Self {
        let deals = Arc::new(AtomicI64::new(0));
        Self {
            rng: Arc::new(move || {
                let deal = deals.fetch_add(1, Ordering::Relaxed);
                Box::new(SplitMix64::new(
                    seed.wrapping_mul(1_000_003).wrapping_add(deal),
                ))
            }),
            first_dealer: None,
            strategy: None,
            reactions: Arc::default(),
        }
    }

    /// Draws the first dealer of each match from generators seeded from `seed`, one per match, so the same seed gives
    /// the same first dealers (US-139). Tables made with `seeded` alone keep North as the first to speak.
    pub fn with_seeded_first_dealer(mut self, seed: i64) -> Self {
        let matches = Arc::new(AtomicI64::new(0));
        self.first_dealer = Some(Arc::new(move || {
            let started = matches.fetch_add(1, Ordering::Relaxed);
            Box::new(SplitMix64::new(
                seed.wrapping_mul(2_000_033).wrapping_add(started),
            ))
        }));
        self
    }

    /// Reactions take their sequence numbers from this counter, shared by every table.
    pub fn with_reaction_sequence(mut self, sequence: Arc<AtomicU64>) -> Self {
        self.reactions = sequence;
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

pub struct Table {
    pub id: Uuid,
    pub kind: TableKind,
    pub difficulty: Option<Difficulty>,
    pub invitation_code: Option<String>,
    lobby: Lobby,
    bidding: Option<BiddingState>,
    board: Option<GameBoard>,
    /// The spectators with an open stream (US-071).
    watching: u32,
    match_score: Option<MatchScore>,
    match_id: Uuid,
    /// The seats that asked for a rematch of the finished match (US-114); empty once a new match is dealt.
    rematch_votes: Vec<usize>,
    round_recorded: bool,
    /// What an undo returns to, and how many undos the match has used (US-146).
    undo: Option<UndoPoint>,
    undos_used: u32,
    /// The day of the daily deal this table plays (US-150): one round, and its score goes to the day's board.
    daily: Option<time::Date>,
    /// The human in charge of a local device.
    viewer: usize,
    /// Changes with every deal, redeals included.
    auction_id: Uuid,
    auction_deals: u32,
    /// The completed-trick count and since when that trick has been shown, at an online table.
    trick_shown: Option<(usize, OffsetDateTime)>,
    version: u64,
    last_activity: OffsetDateTime,
    rng: RngFactory,
    first_dealer: Option<RngFactory>,
    strategy: &'static dyn BotStrategy,
    reactions: Reactions,
    pending: Outcome,
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

fn conflict(code: &'static str, message: &str) -> AppError {
    AppError::conflict(code, message)
}

fn bot_failed(error: GameError) -> AppError {
    AppError::Internal(anyhow::anyhow!("a bot made an illegal move: {error}"))
}

fn auction_error(error: GameError) -> AppError {
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

fn board_error(error: GameError) -> AppError {
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
            invitation_code,
            lobby,
            bidding: None,
            board: None,
            watching: 0,
            match_score: None,
            match_id: Uuid::new_v4(),
            rematch_votes: Vec::new(),
            round_recorded: false,
            undo: None,
            undos_used: 0,
            daily: None,
            viewer,
            auction_id: Uuid::new_v4(),
            auction_deals: 0,
            trick_shown: None,
            version: 0,
            last_activity: now,
            rng: setup.rng,
            first_dealer: setup.first_dealer,
            strategy,
            reactions: Reactions::new(setup.reactions),
            pending: Outcome::default(),
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
        table
            .begin_match(now)
            .expect("the first deal of a local table");
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
        table
    }

    pub fn lobby(&self) -> &Lobby {
        &self.lobby
    }

    pub fn bidding(&self) -> Option<&BiddingState> {
        self.bidding.as_ref()
    }

    pub fn board(&self) -> Option<&GameBoard> {
        self.board.as_ref()
    }

    /// The seats that asked for a rematch of the finished match.
    /// Whether the last card of a solo player can still be taken back, and how many undos the match has left.
    /// The server keeps the time: a late request is refused even while the button is shown.
    pub fn undo_offered(&self) -> bool {
        self.undo.is_some() && self.undos_used < UNDO_LIMIT
    }

    pub fn undos_left(&self) -> u32 {
        if self.kind == TableKind::Local && !self.pass_and_play() {
            UNDO_LIMIT.saturating_sub(self.undos_used)
        } else {
            0
        }
    }

    pub fn rematch_voted(&self) -> &[usize] {
        &self.rematch_votes
    }

    /// The connected humans who have not asked for a rematch yet; bots and disconnected seats do not hold it up.
    pub fn rematch_pending(&self) -> Vec<usize> {
        self.lobby
            .occupied()
            .filter(|(position, seat)| {
                !seat.played_by_bot()
                    && seat.connection == Connection::Connected
                    && !self.rematch_votes.contains(position)
            })
            .map(|(position, _)| position)
            .collect()
    }

    pub fn match_score(&self) -> Option<&MatchScore> {
        self.match_score.as_ref()
    }

    pub fn auction_id(&self) -> Uuid {
        self.auction_id
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    pub fn last_activity(&self) -> OffsetDateTime {
        self.last_activity
    }

    /// The reactions sent at the table in the last 30 seconds, oldest first.
    pub fn reactions(&self, now: OffsetDateTime) -> Vec<Reaction> {
        self.reactions.recent(now)
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

    /// Whether a bot that searches sampled deals, which takes a while, may move during the next change.
    pub fn needs_blocking_bot(&self) -> bool {
        std::ptr::addr_eq(
            self.strategy,
            strategies::for_difficulty(Difficulty::Challenging),
        ) && self.lobby.occupied().any(|(_, seat)| seat.played_by_bot())
    }

    /// The card or the call the Challenging bot would choose for the human whose turn it is (US-065). A hint is a
    /// question: it changes nothing, not even the version. Only local tables give them.
    pub fn hint(&self, actor: Actor) -> Result<Hint, AppError> {
        if self.kind != TableKind::Local {
            return Err(AppError::NotFound);
        }
        let no_hint = || conflict("no-hint", msg::NO_HINT);
        if let Some(board) = &self.board {
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
            let hint = card_hint(&view);
            return Ok(Hint::Card {
                card: CardView::from(hint.card),
                reason: hint.reason,
            });
        }
        let bidding = self.bidding.as_ref().ok_or_else(no_hint)?;
        let seat = self
            .mover(actor, bidding.active_seat())
            .map_err(|_| no_hint())?;
        let hint = auction_hint(&bidding.auction_view(seat));
        let action = match hint.decision {
            AuctionDecision::Pass => BidHint::Pass,
            AuctionDecision::Trump { suit } => BidHint::Trump { suit },
            AuctionDecision::Bid { value, trump } => BidHint::Contract { value, suit: trump },
            AuctionDecision::Coinche => BidHint::Coinche,
        };
        Ok(Hint::Bid {
            action,
            reason: hint.reason,
        })
    }

    /// What an owner needs to invite a friend (US-070): the table and its invitation code. Only the owner of a private
    /// table that is still waiting may invite.
    pub fn invitation(&self, actor: Actor) -> Result<(Uuid, String), AppError> {
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
    pub fn review_input(&self, actor: Actor) -> Result<ReviewInput, AppError> {
        let no_review = || conflict("no-review", msg::NO_REVIEW);
        if self.kind != TableKind::Local {
            return Err(AppError::NotFound);
        }
        self.seat_of(actor)?;
        let board = self.board.as_ref().ok_or_else(no_review)?;
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
        })
    }

    /// Why each bot of a finished solo round played its cards (US-149), from the bots' own views. Only the table's one
    /// human may ask, and only once the round is over.
    pub fn explanations(&self, actor: Actor) -> Result<Vec<PlayReason>, AppError> {
        let input = self.review_input(actor)?;
        let board = self.board.as_ref().expect("a review needs a board");
        let bots: Vec<usize> = (0..4).filter(|&seat| seat != input.seat).collect();
        Ok(play_reasons(
            &input.tricks,
            input.trump,
            board.variant(),
            board.declarer(),
            &bots,
        ))
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
        self.watching = if joined {
            self.watching + 1
        } else {
            self.watching.saturating_sub(1)
        };
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
    ) -> Result<Outcome, AppError> {
        if actor == Actor::Spectator {
            return Err(conflict("spectator", msg::SPECTATOR_READ_ONLY));
        }
        let changed = self.dispatch(actor, action, now)?;
        self.last_activity = now;
        if !changed {
            return Ok(Outcome::default());
        }
        self.refresh_viewer();
        Ok(self.changed())
    }

    fn seat_of(&self, actor: Actor) -> Result<usize, AppError> {
        match (actor, self.kind) {
            (Actor::Seat(position), TableKind::Private | TableKind::Public) => Ok(position),
            (Actor::Device, TableKind::Local) => Ok(self.viewer),
            _ => Err(AppError::table_unauthorized()),
        }
    }

    /// The seat that makes a move: an online player's own, or the human whose turn it is on a local device.
    fn mover(&self, actor: Actor, active: usize) -> Result<usize, AppError> {
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
    ) -> Result<bool, AppError> {
        // Only a card keeps the chance to undo it: anything else that follows makes it final (US-146).
        if matches!(
            action,
            Action::Start { .. }
                | Action::Pass
                | Action::Trump { .. }
                | Action::Contract { .. }
                | Action::Coinche
                | Action::ContinueTrick
                | Action::NextRound
                | Action::Rematch
                | Action::Leave
        ) {
            self.undo = None;
        }
        match action {
            Action::Ready { ready } => {
                let seat = self.seat_of(actor)?;
                self.lobby.set_ready(seat, ready)?;
            }
            Action::Seat { position } => {
                let seat = self.seat_of(actor)?;
                self.lobby.choose_seat(seat, position)?;
            }
            Action::Start { fill_with_bots } => {
                let seat = self.seat_of(actor)?;
                if fill_with_bots {
                    self.lobby.start_with_bots(seat)?;
                } else {
                    self.lobby.start(seat)?;
                }
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
                // Every setting is checked before any changes.
                let mut lobby = self.lobby.clone();
                if let Some(on) = announcements {
                    lobby.set_announcements(seat, on)?;
                }
                if let Some(on) = all_trumps {
                    lobby.set_all_trumps(seat, on)?;
                }
                if let Some(seconds) = turn_timer {
                    lobby.set_turn_timer(seat, seconds)?;
                }
                if let Some(target) = target {
                    lobby.set_target(seat, target)?;
                }
                self.lobby = lobby;
            }
            Action::Spectators { allowed } => {
                let seat = self.seat_of(actor)?;
                self.lobby.set_spectators(seat, allowed)?;
            }
            Action::Pass => self.auction(actor, now, |bidding, seat| bidding.pass(seat))?,
            Action::Trump { suit } => {
                self.auction(actor, now, |bidding, seat| bidding.choose_trump(seat, suit))?
            }
            Action::Contract { value, suit } => {
                let suit = suit.ok_or_else(|| conflict("suit-required", msg::SUIT_REQUIRED))?;
                self.auction(actor, now, |bidding, seat| bidding.bid(seat, value, suit))?
            }
            Action::Coinche => self.auction(actor, now, |bidding, seat| bidding.coinche(seat))?,
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
                let board = self.board.as_mut().expect("checked above");
                let before = board.clone();
                board
                    .play(seat, Card::new(rank, suit), declare.unwrap_or(false))
                    .map_err(board_error)?;
                self.drive_bots(now)?;
                // A card that ends the round is final: the score is already counted.
                let undoable = self.kind == TableKind::Local
                    && !self.pass_and_play()
                    && self
                        .board
                        .as_ref()
                        .is_some_and(|b| b.round_result().is_none());
                self.undo = undoable.then_some(UndoPoint {
                    board: before,
                    at: now,
                });
            }
            Action::Undo => {
                self.seat_of(actor)?;
                if self.kind != TableKind::Local || self.pass_and_play() {
                    return Err(conflict("undo-unavailable", msg::UNDO_UNAVAILABLE));
                }
                let Some(point) = self.undo.take() else {
                    return Err(conflict("undo-unavailable", msg::UNDO_UNAVAILABLE));
                };
                if self.undos_used >= UNDO_LIMIT {
                    return Err(conflict("undo-limit", msg::UNDO_LIMIT_REACHED));
                }
                if now - point.at > UNDO_WINDOW {
                    return Err(conflict("undo-too-late", msg::UNDO_TOO_LATE));
                }
                self.board = Some(point.board);
                self.undos_used += 1;
                self.trick_shown = None;
            }
            Action::ContinueTrick => {
                self.seat_of(actor)?;
                self.started_board()?;
                let board = self.board.as_mut().expect("checked above");
                board.continue_after_trick().map_err(board_error)?;
                self.drive_bots(now)?;
            }
            Action::NextRound => {
                self.seat_of(actor)?;
                if self.daily.is_some() {
                    return Err(conflict("daily-over", msg::DAILY_OVER));
                }
                let score = self
                    .match_score
                    .as_ref()
                    .ok_or_else(|| conflict("not-started", msg::NOT_STARTED))?;
                if score.complete() {
                    return Err(conflict("match-ended", msg::MATCH_ENDED));
                }
                return self.deal_next_round(now, true);
            }
            Action::Rematch => {
                let seat = self.seat_of(actor)?;
                let score = self
                    .match_score
                    .as_ref()
                    .ok_or_else(|| conflict("not-started", msg::NOT_STARTED))?;
                if !score.complete() {
                    return Ok(false);
                }
                // Online, a rematch is proposed to the table: it starts once every connected human has asked for it.
                if self.kind != TableKind::Local {
                    if self.rematch_votes.contains(&seat) {
                        return Ok(false);
                    }
                    self.rematch_votes.push(seat);
                    if !self.rematch_pending().is_empty() {
                        return Ok(true);
                    }
                }
                self.match_score = Some(self.new_match_score());
                self.match_id = Uuid::new_v4();
                self.undos_used = 0;
                self.deal_next_round(now, false)?;
            }
            Action::React { reaction } => {
                let seat = self.seat_of(actor)?;
                if self.kind == TableKind::Local || self.lobby.status() != Status::InProgress {
                    return Err(conflict("reactions-closed", msg::REACTIONS_CLOSED));
                }
                self.reactions.send(seat, reaction, now)?;
            }
            Action::Leave => {
                let seat = self.seat_of(actor)?;
                if self.kind == TableKind::Local {
                    self.pending.removed = true;
                } else {
                    self.lobby.leave(seat)?;
                    self.pending.removed = self.lobby.is_empty();
                }
            }
        }
        Ok(true)
    }

    /// A call in the auction, from the seat that makes it; the bots then take their turns.
    fn auction(
        &mut self,
        actor: Actor,
        now: OffsetDateTime,
        call: impl FnOnce(&mut BiddingState, usize) -> Result<(), GameError>,
    ) -> Result<(), AppError> {
        let bidding = self
            .bidding
            .as_ref()
            .ok_or_else(|| conflict("not-started", msg::NOT_STARTED))?;
        if self.board.is_some() {
            return Err(auction_error(GameError::AuctionEnded));
        }
        let seat = self.mover(actor, bidding.active_seat())?;
        call(self.bidding.as_mut().expect("checked above"), seat).map_err(auction_error)?;
        self.drive_bots(now)
    }

    fn started_board(&self) -> Result<&GameBoard, AppError> {
        if self.bidding.is_none() {
            return Err(conflict("not-started", msg::NOT_STARTED));
        }
        self.board
            .as_ref()
            .ok_or_else(|| conflict("auction-not-finished", msg::AUCTION_NOT_FINISHED))
    }

    /// A match to the table's target: the next round and a rematch keep it.
    fn new_match_score(&self) -> MatchScore {
        MatchScore::to(self.lobby.target()).expect("the lobby holds a valid target")
    }

    fn begin_match(&mut self, now: OffsetDateTime) -> Result<(), AppError> {
        self.match_score = Some(self.new_match_score());
        self.match_id = Uuid::new_v4();
        self.undos_used = 0;
        // Anyone can open a match: the first dealer is drawn, the seat to their left speaks first (US-139).
        let dealer = self.first_dealer.as_ref().map_or(FIRST_DEALER, |draw| {
            usize::try_from(draw().next_int(4)).unwrap_or(FIRST_DEALER) % 4
        });
        self.deal(dealer, None);
        self.drive_bots(now)
    }

    /// Deals the next round once the current one is finished. Within a match, its cards are gathered without a
    /// shuffle (US-085); a rematch starts from a shuffled deck. Several players may click at once, so a call made
    /// after the new deal has already happened is a no-op.
    fn deal_next_round(&mut self, now: OffsetDateTime, same_match: bool) -> Result<bool, AppError> {
        let Some(board) = &self.board else {
            return Ok(false);
        };
        if board.round_result().is_none() {
            return Err(conflict("round-not-finished", msg::ROUND_NOT_FINISHED));
        }
        let dealer = (self
            .bidding
            .as_ref()
            .map_or(FIRST_DEALER, BiddingState::dealer)
            + 1)
            % 4;
        let deck = if same_match {
            board.gathered_deck(dealer)
        } else {
            None
        };
        self.deal(dealer, deck);
        self.drive_bots(now)?;
        Ok(true)
    }

    /// Every deal of the table keeps its variant and its options. A match's first deal has no deck and is shuffled.
    fn deal(&mut self, dealer: usize, deck: Option<Deck>) {
        let bidding = BiddingState::dealt_from(self.lobby.variant(), dealer, (self.rng)(), deck)
            .with_announcements(self.lobby.announcements())
            .with_all_trumps(self.lobby.all_trumps());
        self.auction_deals = bidding.deals();
        self.bidding = Some(bidding);
        self.auction_id = Uuid::new_v4();
        self.board = None;
        self.round_recorded = false;
        self.rematch_votes.clear();
        self.trick_shown = None;
    }

    /// Bots take their turns until a human's turn, a completed trick or the end of the round; a finished round is
    /// then added to the match score once.
    fn drive_bots(&mut self, now: OffsetDateTime) -> Result<(), AppError> {
        if self.board.is_none()
            && let Some(bidding) = self.bidding.as_mut()
        {
            while bidding.completed_board().is_none()
                && self
                    .lobby
                    .seat(bidding.active_seat())
                    .is_some_and(Seat::played_by_bot)
            {
                turns::take_auction_turn(bidding, self.strategy).map_err(bot_failed)?;
            }
            if bidding.deals() != self.auction_deals {
                self.auction_deals = bidding.deals();
                self.auction_id = Uuid::new_v4();
            }
            self.board = bidding.completed_board().cloned();
        }
        if let Some(board) = self.board.as_mut() {
            while board.round_result().is_none()
                && !board.reviewing_completed_trick()
                && self
                    .lobby
                    .seat(board.active_seat())
                    .is_some_and(Seat::played_by_bot)
            {
                turns::play_turn(board, self.strategy).map_err(bot_failed)?;
            }
        }
        self.stamp_trick_review(now);
        self.record_round_if_complete(now);
        Ok(())
    }

    fn stamp_trick_review(&mut self, now: OffsetDateTime) {
        let shown = self.board.as_ref().filter(|board| {
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
        if self.round_recorded {
            return;
        }
        let (Some(board), Some(score)) = (&self.board, self.match_score.as_mut()) else {
            return;
        };
        let Some(round) = board.round_summary() else {
            return;
        };
        self.round_recorded = true;
        let points = round.result.north_south_awarded;
        if let (Some(day), Some(account)) =
            (self.daily, self.lobby.seat(0).and_then(|seat| seat.account))
        {
            self.pending.daily = Some(DailyResult {
                day,
                account,
                score: points,
            });
        }
        if score.record_summary(round) && !self.pass_and_play() {
            self.pending.finished = Some(self.finished_match(now));
        }
    }

    fn finished_match(&self, now: OffsetDateTime) -> FinishedMatch {
        let score = self.match_score.as_ref().expect("a match was played");
        FinishedMatch {
            id: self.match_id,
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
            undos: self.undos_used,
        }
    }

    /// The human in charge of a local device: the active player when that is a human and no completed trick is on
    /// the table, otherwise the human who was in charge before.
    pub fn viewer(&self) -> usize {
        let active = match (&self.board, &self.bidding) {
            (Some(board), _) => board.active_seat(),
            (None, Some(bidding)) => bidding.active_seat(),
            (None, None) => return self.viewer,
        };
        let trick_shown = self.board.as_ref().is_some_and(|board| {
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
    ) -> Result<usize, AppError> {
        let position = self.lobby.join(name, account)?;
        self.last_activity = now;
        if self.lobby.status() == Status::InProgress {
            self.begin_match(now)?;
        }
        self.changed();
        Ok(position)
    }

    /// Starts a waiting public table with bots once its deadline has passed; true when it did.
    pub fn fill_with_bots_if_due(&mut self, now: OffsetDateTime) -> bool {
        if !self.lobby.fill_with_bots_if_due(now) {
            return false;
        }
        if let Err(error) = self.begin_match(now) {
            tracing::warn!(table = %self.id, %error, "the bots could not begin the match");
        }
        self.changed();
        true
    }

    pub fn disconnect(&mut self, position: usize, now: OffsetDateTime) -> Result<(), AppError> {
        self.lobby.disconnect(position, now)?;
        self.changed();
        Ok(())
    }

    /// Marks the seat connected again; a seat already connected changes nothing.
    pub fn reconnect(&mut self, position: usize) -> Result<(), AppError> {
        if self
            .lobby
            .seat(position)
            .is_some_and(|seat| seat.connection == Connection::Connected)
        {
            return Ok(());
        }
        self.lobby.reconnect(position)?;
        self.changed();
        Ok(())
    }

    /// Hands to bots the seats disconnected for at least `timeout`; the bots then play any turn they now hold.
    pub fn replace_expired_disconnections(
        &mut self,
        now: OffsetDateTime,
        timeout: Duration,
    ) -> Option<Outcome> {
        if !self.lobby.replace_expired_disconnections(now, timeout) {
            return None;
        }
        if let Err(error) = self.drive_bots(now) {
            tracing::warn!(table = %self.id, %error, "the bots could not take over");
        }
        Some(self.changed())
    }

    /// While an online table shows a completed trick for at least `review`, the count of completed tricks.
    pub fn trick_review_due(&self, now: OffsetDateTime, review: Duration) -> Option<usize> {
        let (count, since) = self.trick_shown?;
        let board = self.board.as_ref()?;
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
        let board = self.board.as_mut()?;
        if !board.reviewing_completed_trick() || board.completed_tricks() != expected_tricks {
            return None;
        }
        board.continue_after_trick().ok()?;
        if let Err(error) = self.drive_bots(now) {
            tracing::warn!(table = %self.id, %error, "the bots could not play after the trick");
        }
        Some(self.changed())
    }

    /// Takes a deleted account away from the table: it leaves a table still waiting for players, and a bot plays its
    /// seat, as "Deleted player", in a match. The match finished afterwards is recorded without it.
    pub fn release_account(&mut self, account: Uuid, now: OffsetDateTime) -> Outcome {
        let seats: Vec<usize> = self
            .lobby
            .occupied()
            .filter(|(_, seat)| seat.account == Some(account))
            .map(|(position, _)| position)
            .collect();
        if seats.is_empty() {
            return Outcome::default();
        }
        for position in seats {
            if self.lobby.status() == Status::WaitingForPlayers {
                self.lobby
                    .leave(position)
                    .expect("a waiting seat can leave");
            } else {
                let seat = self.lobby.seat_mut(position).expect("an occupied seat");
                seat.account = None;
                if self.kind != TableKind::Local {
                    self.lobby
                        .hand_to_bot(position, DELETED_PLAYER)
                        .expect("an occupied seat");
                }
            }
        }
        self.pending.removed = self.lobby.is_empty();
        if self.lobby.status() == Status::InProgress
            && let Err(error) = self.drive_bots(now)
        {
            tracing::warn!(table = %self.id, %error, "the bots could not take over");
        }
        self.changed()
    }
}
