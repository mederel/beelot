//! What a player sees of a table: one snapshot with the table, the auction, the card play and the match, each part
//! shown from the player's seat. The parts keep the JSON shapes the frontend renders: the table, the bidding, the
//! board, the match and the reactions. `tests/contract/*.json` holds examples.

use beelot_game::announcements::{self, Announcement};
use beelot_game::bidding::BiddingState;
use beelot_game::board::{GameBoard, ReviewedTrick};
use beelot_game::bot::hints::{CardReason, WhyNot};
use beelot_game::match_score::MatchRecap;
use beelot_game::scoring::{Declaration, RoundResult};
use beelot_game::{Card, Difficulty, IllegalReason, Suit, Team, Trump, Variant, rules};
use serde::Serialize;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::tables::messages::{self, Coded, trump_name};
use crate::tables::reactions::TableReaction;
use crate::tables::{Connection, SeatKind, Status, Table, TableKind, Tutorial};
pub use beelot_table::CardView;

/// Whose view to build: an online player's seat, or a local table's device, which shows the hand of the human in
/// charge of it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Viewer {
    Seat(usize),
    Device,
    /// Someone watching: what the table shows, without any hand.
    Spectator,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub version: u64,
    /// The calls and cards played so far (US-163), which the client counts the moves missed during a gap from.
    pub moves: u64,
    pub table_id: Uuid,
    pub kind: TableKind,
    pub you: Option<usize>,
    pub table: TableView,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bidding: Option<BiddingView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub board: Option<BoardView>,
    #[serde(rename = "match", skip_serializing_if = "Option::is_none")]
    pub r#match: Option<MatchView>,
    pub reactions: Vec<ReactionView>,
    /// What a tutorial table says to its player (US-199); absent at every other table.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tutorial: Option<TutorialView>,
}

/// A tutorial table: its lesson (none in the free game), whether the lesson is done, and what the coach says when it is
/// the player's turn to play.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TutorialView {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lesson: Option<String>,
    pub lesson_done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coach: Option<CoachView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoachView {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<LessonProgressView>,
    pub card: CardView,
    pub why: CardReason,
    /// Every other legal card and why it is not the coached one.
    pub others: Vec<WhyNotView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonProgressView {
    pub step: usize,
    pub steps: usize,
    pub number: usize,
    pub lessons: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhyNotView {
    pub card: CardView,
    pub why_not: WhyNot,
}

fn tutorial_view(table: &Table) -> Option<TutorialView> {
    let tutorial = table.tutorial_kind()?;
    Some(TutorialView {
        lesson: match tutorial {
            Tutorial::Lesson { id } => Some(id.clone()),
            Tutorial::Free => None,
        },
        lesson_done: table.lesson_done(),
        coach: table.coach().map(|coach| CoachView {
            progress: coach.lesson.map(|lesson| LessonProgressView {
                step: lesson.step,
                steps: lesson.steps,
                number: lesson.number,
                lessons: lesson.lessons,
            }),
            card: coach.card.into(),
            why: coach.why,
            others: coach
                .others
                .into_iter()
                .map(|(card, why_not)| WhyNotView {
                    card: card.into(),
                    why_not,
                })
                .collect(),
        }),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableView {
    pub id: Uuid,
    pub invitation_code: Option<String>,
    pub owner_position: usize,
    pub status: &'static str,
    pub variant: Variant,
    pub variant_label: &'static str,
    pub turn_timer_seconds: u32,
    pub seats: Vec<SeatView>,
    pub public_table: bool,
    #[serde(with = "time::serde::rfc3339::option")]
    pub bot_fill_at: Option<OffsetDateTime>,
    pub announcements: bool,
    /// Whether Contrée bids may name tout-atout and sans-atout.
    pub all_trumps: bool,
    /// The points the match is played to.
    pub target: i32,
    pub kind: TableKind,
    pub difficulty: Option<Difficulty>,
    pub difficulty_label: Option<&'static str>,
    pub pass_and_play: bool,
    /// Whether the table offers hints (US-065): local tables do.
    pub hints: bool,
    /// Whether the last card played at a solo table can be taken back, and the undos the match has left (US-146).
    pub undo_offered: bool,
    pub undos_left: u32,
    /// Whether people may watch (US-071), and how many do now.
    pub spectators_allowed: bool,
    pub spectators: u32,
}

/// `position` is the seat from 0 to 3 in table order; seats 0 and 2 play North–South.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeatView {
    pub name: String,
    pub ready: bool,
    pub connection_state: &'static str,
    pub position: usize,
    pub you: bool,
    /// `HUMAN` or `BOT`.
    #[serde(rename = "type")]
    pub r#type: &'static str,
}

/// A card of the viewer's hand that cannot be played now, and why (`MUST_FOLLOW` carries the suit led).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllegalCardView {
    pub card: CardView,
    pub reason: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suit: Option<Suit>,
}

impl IllegalCardView {
    fn new(card: Card, reason: IllegalReason) -> Self {
        let (reason, suit) = match reason {
            IllegalReason::MustFollow(suit) => ("MUST_FOLLOW", Some(suit)),
            IllegalReason::MustTrump => ("MUST_TRUMP", None),
            IllegalReason::MustOvertrump => ("MUST_OVERTRUMP", None),
        };
        Self {
            card: card.into(),
            reason,
            suit,
        }
    }
}

fn cards(cards: impl IntoIterator<Item = Card>) -> Vec<CardView> {
    cards.into_iter().map(CardView::from).collect()
}

fn sorted(hand: &[Card], trump: Option<Trump>) -> Vec<CardView> {
    let mut hand = hand.to_vec();
    hand.sort_by_key(|card| card.display_key(trump));
    cards(hand)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerCallView {
    pub player_name: String,
    pub call: String,
    /// The call as a code and its parameters; absent while the seat has not called.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub call_code: Option<Coded>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuctionCallView {
    pub player_name: String,
    pub call: String,
    pub call_code: Coded,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiddingView {
    pub hand: Vec<CardView>,
    /// The viewer's own cards in the order the deal gave them (US-140): the order the table animates them in.
    pub dealt: Vec<CardView>,
    pub upturned_card: Option<CardView>,
    pub round: i32,
    pub active_player: String,
    pub player_turn: bool,
    pub message: String,
    /// What `message` says, as a code and its parameters.
    pub message_code: Coded,
    pub variant: Variant,
    pub highest_bid: i32,
    /// The suit's name, or empty before the first bid.
    pub highest_bid_suit: &'static str,
    /// The bidder's name, or empty before the first bid.
    pub highest_bidder: String,
    pub coinche_allowed: bool,
    pub complete: bool,
    pub dealer_index: usize,
    /// Each player's latest call of the deal, in table order.
    pub calls: Vec<PlayerCallView>,
    pub current_player_index: usize,
    pub auction_id: Uuid,
    /// Every call of the deal, in the order they were made.
    pub auction: Vec<AuctionCallView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardSeatView {
    pub name: String,
    pub card_count: usize,
    pub active: bool,
    pub team: &'static str,
}

/// `suit` is null for a carré.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementView {
    pub kind: announcements::AnnouncementKind,
    pub value: i32,
    pub suit: Option<Suit>,
    pub cards: Vec<CardView>,
    pub top_card: CardView,
}

impl From<&Announcement> for AnnouncementView {
    fn from(announcement: &Announcement) -> Self {
        Self {
            kind: announcement.kind,
            value: announcement.value,
            suit: announcement.suit,
            cards: cards(announcement.cards.iter().copied()),
            top_card: announcement.top_card().into(),
        }
    }
}

/// A player's declared announcements, and whether their team scores them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeclarationView {
    pub seat: usize,
    pub player: String,
    pub team: &'static str,
    pub announcements: Vec<AnnouncementView>,
    pub scored: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundResultView {
    pub north_south_card_points: i32,
    pub east_west_card_points: i32,
    pub north_south_dix_de_der: i32,
    pub east_west_dix_de_der: i32,
    pub north_south_belote_bonus: i32,
    pub east_west_belote_bonus: i32,
    pub contract_made: bool,
    pub north_south_awarded: i32,
    pub east_west_awarded: i32,
    /// The Contrée bid counted for each team, before a coinche doubles it (US-130).
    pub north_south_bid: i32,
    pub east_west_bid: i32,
    pub capot_team: Option<Team>,
    pub north_south_announcements: i32,
    pub east_west_announcements: i32,
    pub announcements: Vec<DeclarationView>,
    /// The round's tricks in order, for the review (US-066).
    pub review: Vec<ReviewTrickView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewTrickView {
    pub cards: Vec<ReviewCardView>,
    pub winner: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCardView {
    pub seat: usize,
    pub card: CardView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardView {
    /// The four hands in seat order, at a tutorial table (US-199) only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub all_hands: Option<Vec<Vec<CardView>>>,
    pub hand: Vec<CardView>,
    /// The viewer's own cards in deal order (US-140): the first deal's, then the second deal's, the upturned card
    /// among them as the taker received it.
    pub dealt: Vec<CardView>,
    pub legal_cards: Vec<CardView>,
    pub illegal_cards: Vec<IllegalCardView>,
    pub seats: Vec<BoardSeatView>,
    pub trump: &'static str,
    pub declaring_team: &'static str,
    pub active_player: String,
    pub completed_tricks: usize,
    pub north_south_score: i32,
    pub east_west_score: i32,
    pub current_trick: Vec<CardView>,
    pub reviewing_completed_trick: bool,
    pub trick_winner: String,
    pub trick_points: i32,
    pub declaration_message: String,
    /// What `declaration_message` says, as a code and its parameters; absent before a declaration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub declaration_code: Option<Coded>,
    pub belote_bonus_points: i32,
    pub round_result: Option<RoundResultView>,
    pub variant: Variant,
    pub contract_value: i32,
    pub coinched: bool,
    pub current_player: String,
    pub current_player_index: usize,
    pub active_player_index: usize,
    pub dealer_index: usize,
    pub declaring_player_index: usize,
    pub announcements: bool,
    /// The viewer's announcements, offered with their first card.
    pub own_announcements: Vec<AnnouncementView>,
    /// Who declared announcements, until they are revealed after the first trick.
    pub declarers: Vec<String>,
    pub revealed_announcements: Vec<DeclarationView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchView {
    pub north_south: i32,
    pub east_west: i32,
    pub complete: bool,
    pub winner: Option<Team>,
    pub target: i32,
    /// Only once the match is complete: what it looks back on (US-093).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recap: Option<MatchRecap>,
    /// Online, once the match is complete: the seats that asked for a rematch, and the humans it still waits for
    /// (US-114).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub rematch_voted: Vec<usize>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub rematch_pending: Vec<usize>,
}

/// A reaction from the seat at `position`; clients show the reactions whose sequence they have not seen.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactionView {
    pub sequence: u64,
    pub position: usize,
    pub reaction: TableReaction,
}

fn team_name(seat: usize) -> &'static str {
    Team::of(seat).display_name()
}

fn status_name(status: Status) -> &'static str {
    match status {
        Status::WaitingForPlayers => "WAITING_FOR_PLAYERS",
        Status::InProgress => "IN_PROGRESS",
    }
}

fn connection_name(connection: Connection) -> &'static str {
    match connection {
        Connection::Connected => "CONNECTED",
        Connection::Disconnected { .. } => "DISCONNECTED",
        Connection::BotTakeover => "BOT_TAKEOVER",
    }
}

/// The table as `viewer` sees it at `now`. A seat's own cards, what it may play, its turn and its announcements are
/// read only for a seat: a spectator's view is built from the public parts (the tricks, the bids, the scores) and no
/// hand is ever read for it, so nothing private has to be taken out afterwards.
pub fn snapshot(table: &Table, viewer: Viewer, now: OffsetDateTime) -> Snapshot {
    // The seat the view is from, or none for a spectator.
    let you = match viewer {
        Viewer::Seat(position) => Some(position),
        Viewer::Device => Some(table.viewer()),
        Viewer::Spectator => None,
    };
    let name = |seat: usize| {
        table
            .lobby()
            .seat(seat)
            .map(|seat| seat.name.clone())
            .unwrap_or_default()
    };
    Snapshot {
        version: table.version(),
        moves: table.moves(),
        table_id: table.id,
        kind: table.kind,
        you: you.filter(|&seat| table.lobby().seat(seat).is_some()),
        table: table_view(table, you),
        bidding: table
            .bidding()
            .map(|bidding| bidding_view(table, bidding, you, &name)),
        board: table.board().map(|board| {
            let mut view = board_view(board, you, &name);
            // A tutorial's player sees every hand: it is a lesson, and its table has one viewer.
            if viewer == Viewer::Device && table.tutorial_kind().is_some() {
                view.all_hands = Some(
                    (0..4)
                        .map(|seat| sorted(board.hand(seat), Some(board.trump())))
                        .collect(),
                );
            }
            view
        }),
        r#match: table.match_score().map(|score| MatchView {
            north_south: score.north_south(),
            east_west: score.east_west(),
            complete: score.complete(),
            winner: score.winner(),
            target: score.target(),
            recap: score.complete().then(|| score.recap()),
            rematch_voted: table.rematch_voted().to_vec(),
            rematch_pending: if table.rematch_voted().is_empty() {
                Vec::new()
            } else {
                table.rematch_pending()
            },
        }),
        reactions: table
            .reactions(now)
            .into_iter()
            .map(|reaction| ReactionView {
                sequence: reaction.sequence,
                position: reaction.position,
                reaction: reaction.reaction,
            })
            .collect(),
        tutorial: if viewer == Viewer::Device {
            tutorial_view(table)
        } else {
            None
        },
    }
}

fn table_view(table: &Table, you: Option<usize>) -> TableView {
    let lobby = table.lobby();
    let public = lobby.is_public();
    TableView {
        id: table.id,
        invitation_code: table.invitation_code.clone(),
        owner_position: lobby.owner(),
        status: status_name(lobby.status()),
        variant: lobby.variant(),
        variant_label: lobby.variant().display_name(),
        turn_timer_seconds: lobby.turn_timer_seconds(),
        seats: lobby
            .occupied()
            .map(|(position, seat)| SeatView {
                name: seat.name.clone(),
                ready: seat.ready,
                connection_state: connection_name(seat.connection),
                position,
                you: you == Some(position),
                r#type: match seat.kind {
                    SeatKind::Human => "HUMAN",
                    SeatKind::Bot => "BOT",
                },
            })
            .collect(),
        public_table: public,
        bot_fill_at: lobby
            .bot_fill_at()
            .filter(|_| lobby.status() == Status::WaitingForPlayers),
        announcements: lobby.announcements(),
        all_trumps: lobby.all_trumps(),
        target: lobby.target(),
        kind: table.kind,
        difficulty: table.difficulty,
        difficulty_label: table.difficulty.map(difficulty_label),
        pass_and_play: table.pass_and_play(),
        hints: table.kind == TableKind::Local && table.tutorial_kind().is_none(),
        undo_offered: table.undo_offered(),
        undos_left: table.undos_left(),
        spectators_allowed: lobby.spectators(),
        spectators: table.watching(),
    }
}

fn difficulty_label(difficulty: Difficulty) -> &'static str {
    match difficulty {
        Difficulty::Relaxed => "Relaxed",
        Difficulty::Challenging => "Challenging",
    }
}

fn bidding_view(
    table: &Table,
    bidding: &BiddingState,
    you: Option<usize>,
    name: &impl Fn(usize) -> String,
) -> BiddingView {
    let active = bidding.active_seat();
    let auction = bidding.auction();
    let auction_message = messages::auction_message(bidding, table.lobby().variant(), name);
    BiddingView {
        hand: you.map_or_else(Vec::new, |you| sorted(bidding.hand(you), None)),
        dealt: you.map_or_else(Vec::new, |you| cards(bidding.hand(you).iter().copied())),
        upturned_card: bidding.upturned_card().map(CardView::from),
        round: bidding.round(),
        active_player: name(active),
        player_turn: you == Some(active),
        message: auction_message.english().to_owned(),
        message_code: auction_message.coded(),
        variant: table.lobby().variant(),
        highest_bid: bidding.highest_bid(),
        highest_bid_suit: bidding.highest_bid_suit().map_or("", trump_name),
        highest_bidder: bidding.highest_bidder().map(name).unwrap_or_default(),
        coinche_allowed: you.is_some_and(|you| bidding.can_coinche(you)),
        complete: bidding.completed_board().is_some(),
        dealer_index: bidding.dealer(),
        calls: (0..4)
            .map(|seat| {
                let call = auction
                    .iter()
                    .rev()
                    .find(|call| call.seat == seat)
                    .map(messages::call_label);
                PlayerCallView {
                    player_name: name(seat),
                    call: call
                        .as_ref()
                        .map(|call| call.english().to_owned())
                        .unwrap_or_default(),
                    call_code: call.as_ref().map(messages::Message::coded),
                    active: seat == active,
                }
            })
            .collect(),
        current_player_index: you.unwrap_or(0),
        auction_id: table.auction_id(),
        auction: auction
            .iter()
            .map(|call| {
                let label = messages::call_label(call);
                AuctionCallView {
                    player_name: name(call.seat),
                    call: label.english().to_owned(),
                    call_code: label.coded(),
                }
            })
            .collect(),
    }
}

fn declaration_view(declaration: &Declaration, name: &impl Fn(usize) -> String) -> DeclarationView {
    DeclarationView {
        seat: declaration.seat,
        player: name(declaration.seat),
        team: team_name(declaration.seat),
        announcements: declaration
            .announcements
            .iter()
            .map(AnnouncementView::from)
            .collect(),
        scored: declaration.scored,
    }
}

fn round_result_view(
    result: &RoundResult,
    review: Vec<ReviewedTrick>,
    name: &impl Fn(usize) -> String,
) -> RoundResultView {
    RoundResultView {
        review: review
            .into_iter()
            .map(|trick| ReviewTrickView {
                cards: trick
                    .cards
                    .iter()
                    .map(|played| ReviewCardView {
                        seat: played.seat,
                        card: played.card.into(),
                    })
                    .collect(),
                winner: trick.winner,
            })
            .collect(),
        north_south_card_points: result.north_south_card_points,
        east_west_card_points: result.east_west_card_points,
        north_south_dix_de_der: result.north_south_dix_de_der,
        east_west_dix_de_der: result.east_west_dix_de_der,
        north_south_belote_bonus: result.north_south_belote_bonus,
        east_west_belote_bonus: result.east_west_belote_bonus,
        contract_made: result.contract_made,
        north_south_awarded: result.north_south_awarded,
        east_west_awarded: result.east_west_awarded,
        north_south_bid: result.north_south_bid,
        east_west_bid: result.east_west_bid,
        capot_team: result.capot_team,
        north_south_announcements: result.north_south_announcements,
        east_west_announcements: result.east_west_announcements,
        announcements: result
            .announcements
            .iter()
            .map(|declaration| declaration_view(declaration, name))
            .collect(),
    }
}

fn board_view(board: &GameBoard, you: Option<usize>, name: &impl Fn(usize) -> String) -> BoardView {
    let trump = board.trump();
    let active = board.active_seat();
    // Only a seat has a hand, cards it may play and announcements of its own.
    let hand = you.map_or(&[][..], |you| board.hand(you));
    let declaration = messages::declaration(board, name);
    let reviewing = board.reviewing_completed_trick();
    let visible = board.visible_trick();
    let (north_south_score, east_west_score) = board.scores();
    let announcements = board.announcements();
    BoardView {
        all_hands: None,
        hand: sorted(hand, Some(trump)),
        dealt: cards(hand.iter().copied()),
        legal_cards: you.map_or_else(Vec::new, |you| cards(board.legal_cards(you))),
        illegal_cards: you.map_or_else(Vec::new, |you| {
            board
                .illegal_cards(you)
                .into_iter()
                .map(|(card, reason)| IllegalCardView::new(card, reason))
                .collect()
        }),
        seats: (0..4)
            .map(|seat| BoardSeatView {
                name: name(seat),
                card_count: board.hand(seat).len(),
                active: seat == active,
                team: team_name(seat),
            })
            .collect(),
        trump: trump.display_name(),
        declaring_team: team_name(board.declarer()),
        active_player: name(active),
        completed_tricks: board.completed_tricks(),
        north_south_score,
        east_west_score,
        current_trick: cards(visible.iter().map(|played| played.card)),
        reviewing_completed_trick: reviewing,
        trick_winner: if reviewing {
            name(board.next_leader())
        } else {
            String::new()
        },
        trick_points: visible
            .iter()
            .map(|played| rules::points(played.card, trump))
            .sum(),
        declaration_message: declaration
            .as_ref()
            .map(|declaration| declaration.english().to_owned())
            .unwrap_or_default(),
        declaration_code: declaration.as_ref().map(messages::Message::coded),
        belote_bonus_points: board.belote_bonus(),
        round_result: board
            .round_result()
            .map(|result| round_result_view(result, board.review(), name)),
        variant: board.variant(),
        contract_value: board.contract_value(),
        coinched: board.coinched(),
        current_player: name(you.unwrap_or(0)),
        current_player_index: you.unwrap_or(0),
        active_player_index: active,
        dealer_index: board.dealer(),
        declaring_player_index: board.declarer(),
        announcements,
        own_announcements: if announcements && hand.len() == 8 {
            announcements::find(hand, trump)
                .iter()
                .map(AnnouncementView::from)
                .collect()
        } else {
            Vec::new()
        },
        declarers: if board.revealed().is_empty() {
            board
                .declared()
                .iter()
                .map(|entry| name(entry.seat))
                .collect()
        } else {
            Vec::new()
        },
        revealed_announcements: board
            .revealed()
            .iter()
            .map(|declaration| declaration_view(declaration, name))
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use beelot_game::board::GameBoard;

    fn board_after_one_lead() -> GameBoard {
        let mut hands: [Vec<Card>; 4] = Default::default();
        for (index, card) in Card::deck().into_iter().enumerate() {
            hands[index % 4].push(card);
        }
        let mut board = GameBoard::from_bidding(hands, Suit::Hearts, 0, 3, false);
        let leader = board.active_seat();
        let lead = board.legal_cards(leader)[0];
        board.play(leader, lead, false).unwrap();
        board
    }

    #[test]
    fn the_board_view_says_why_each_unplayable_card_is_illegal() {
        let board = board_after_one_lead();
        let seat = board.active_seat();
        let view = board_view(&board, Some(seat), &|index| format!("Seat {index}"));
        let json = serde_json::to_value(&view).unwrap();

        let illegal = json["illegalCards"].as_array().unwrap();
        assert!(!illegal.is_empty());
        let legal = json["legalCards"].as_array().unwrap();
        assert_eq!(
            legal.len() + illegal.len(),
            json["hand"].as_array().unwrap().len()
        );
        for entry in illegal {
            assert_eq!(
                entry["reason"], "MUST_FOLLOW",
                "round-robin hands hold every suit: {entry}"
            );
            assert!(entry["suit"].is_string(), "{entry}");
            assert!(entry["card"]["rank"].is_string() && entry["card"]["symbol"].is_string());
        }
    }

    #[test]
    fn a_seat_that_is_not_to_play_gets_no_illegal_cards() {
        let board = board_after_one_lead();
        let waiting = (board.active_seat() + 1) % 4;
        let json = serde_json::to_value(board_view(&board, Some(waiting), &|index| {
            format!("Seat {index}")
        }))
        .unwrap();
        assert_eq!(json["illegalCards"], serde_json::json!([]));
        assert_eq!(json["legalCards"], serde_json::json!([]));
    }
}
