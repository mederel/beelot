//! Every text the tables and the server send to a player: a code, its parameters and the English sentence. The
//! frontend renders the code in the player's language (`i18n-messages.js`); the English stays in the responses for
//! one release, for pages loaded before the deploy. Rewording an English sentence changes nothing for the other
//! languages, and a code the frontend does not know fails its tests (see `catalogue`).

use std::borrow::Cow;
use std::collections::BTreeMap;

use beelot_game::Trump;
use beelot_game::Variant;
use beelot_game::bidding::{BiddingState, CallType, SeatCall};
use beelot_game::board::{BeloteDeclaration, GameBoard};
use serde::Serialize;

/// What the wire carries beside an English sentence: the code and its parameters (names, values, suits).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Coded {
    pub code: &'static str,
    pub params: BTreeMap<&'static str, String>,
}

/// A text for a player: its code, its parameters and its English sentence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Message {
    pub code: &'static str,
    pub params: BTreeMap<&'static str, String>,
    english: Cow<'static, str>,
}

impl Message {
    const fn fixed(code: &'static str, english: &'static str) -> Self {
        Message {
            code,
            params: BTreeMap::new(),
            english: Cow::Borrowed(english),
        }
    }

    fn with<const N: usize>(
        code: &'static str,
        english: String,
        params: [(&'static str, String); N],
    ) -> Self {
        Message {
            code,
            params: params.into_iter().collect(),
            english: Cow::Owned(english),
        }
    }

    /// The English sentence.
    pub fn english(&self) -> &str {
        &self.english
    }

    /// The code and the parameters, as they are sent.
    pub fn coded(&self) -> Coded {
        Coded {
            code: self.code,
            params: self.params.clone(),
        }
    }
}

impl std::fmt::Display for Message {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.english())
    }
}

macro_rules! fixed_messages {
    ($($(#[$doc:meta])* $name:ident = $code:literal, $english:literal;)*) => {
        $($(#[$doc])* pub const $name: Message = Message::fixed($code, $english);)*

        /// Every message that takes no parameter.
        fn fixed_messages() -> Vec<Message> {
            vec![$($name),*]
        }
    };
}

fixed_messages! {
    TABLE_CLOSED = "table-closed", "This table does not exist.";
    ALREADY_STARTED = "already-started", "This table has already started.";
    TABLE_FULL = "table-full", "This table is full.";
    NOT_SEATED = "not-seated", "You are not seated at this table.";
    SEATS_ASSIGNED = "seats-assigned", "Seats are assigned at public tables.";
    NO_SUCH_SEAT = "no-such-seat", "That seat does not exist.";
    SEAT_TAKEN = "seat-taken", "That seat is taken.";
    OWNER_STARTS = "owner-starts", "Only the table owner can start the game.";
    FOUR_READY_PLAYERS = "four-ready-players", "Four ready players are required to start the game.";
    READY_FOR_BOTS = "ready-for-bots", "Every seated player must be ready to start with bots.";
    OWNER_SETS_TIMER = "owner-sets-timer", "Only the table owner can change the turn timer.";
    TIMER_LOCKED = "timer-locked", "The turn timer cannot change after the game starts.";
    TIMER_CHOICES = "timer-choices", "Choose no timer, 30 seconds, or 60 seconds.";
    PUBLIC_ANNOUNCEMENTS = "public-announcements", "Public tables always play with announcements.";
    OWNER_SETS_ANNOUNCEMENTS = "owner-sets-announcements", "Only the table owner can change announcements.";
    ANNOUNCEMENTS_LOCKED = "announcements-locked", "Announcements cannot change after the game starts.";
    PUBLIC_ALL_TRUMPS = "public-all-trumps", "Public tables always play with tout-atout and sans-atout.";
    OWNER_SETS_ALL_TRUMPS = "owner-sets-all-trumps", "Only the table owner can change tout-atout and sans-atout.";
    ALL_TRUMPS_LOCKED = "all-trumps-locked", "Tout-atout and sans-atout cannot change after the game starts.";
    ALL_TRUMPS_NOT_PLAYED = "all-trumps-not-played", "Tout-atout and sans-atout are not played at this table.";
    PUBLIC_TARGET = "public-target", "Public tables always play to 1,000 points.";
    OWNER_SETS_TARGET = "owner-sets-target", "Only the table owner can change the match target.";
    TARGET_LOCKED = "target-locked", "The match target cannot change after the game starts.";
    TARGET_CHOICES = "target-choices", "The match target must be 500, 1,000, 1,500 or 2,000 points.";
    BOT_TOOK_OVER = "bot-took-over", "A bot has taken over this seat for the rest of the match.";

    NAME_REQUIRED = "name-required", "Enter a player name.";
    NAME_TOO_LONG = "name-too-long", "Player names are limited to 30 characters.";
    FOUR_SEATS = "four-seats", "Fill in the four seats.";
    TWO_PLAYERS = "two-players", "Pass and play needs at least two players.";
    DIFFERENT_NAMES = "different-names", "Each player needs a different name.";

    NOT_YOUR_TURN_TO_BID = "not-your-turn-to-bid", "It is not your turn to bid.";
    NOT_YOUR_TURN_TO_PLAY = "not-your-turn-to-play", "It is not your turn to play.";
    /// At a local table, when a bot is to act.
    NOT_YOUR_TURN = "not-your-turn", "It is not your turn.";
    NO_HINT = "no-hint", "There is no hint to give now.";
    PUBLIC_SPECTATORS = "public-spectators", "Public tables do not take spectators.";
    OWNER_SETS_SPECTATORS = "owner-sets-spectators", "Only the table owner can allow spectators.";
    SPECTATORS_LOCKED = "spectators-locked", "Spectators can only be allowed before the game starts.";
    NO_SPECTATORS = "no-spectators", "This table does not allow spectators.";
    TOO_MANY_SPECTATORS = "too-many-spectators", "This table has enough spectators.";
    SPECTATOR_READ_ONLY = "spectator-read-only", "Spectators can only watch.";
    INVITE_OWNER_ONLY = "invite-owner-only", "Only the owner of a table that has not started can invite friends.";
    NO_REVIEW = "no-review", "There is no finished round to analyse.";
    ILLEGAL_CARD = "illegal-card", "That card is not a legal play.";
    TUTORIAL_CARD = "tutorial-card", "That is not the card the coach asked for.";
    ROUND_ENDED = "round-ended", "This round has ended.";
    NO_COMPLETED_TRICK = "no-completed-trick", "There is no completed trick to continue from.";
    CONTRACT_ONLY_IN_CONTREE = "contract-only-in-contree", "Contract bids are only available in Contrée.";
    TRUMP_CHOICE_ONLY_IN_CLASSIC = "trump-choice-only-in-classic", "Choose a contract value and suit in Contrée.";
    AUCTION_ENDED = "auction-ended", "The auction has ended.";
    DEALER_MUST_CHOOSE_TRUMP = "dealer-must-choose-trump", "The dealer may not pass: name the trump suit.";
    MUST_TAKE_UPTURNED_SUIT = "must-take-upturned-suit", "In the first round, you may only accept the upturned suit.";
    MUST_CHOOSE_ANOTHER_SUIT = "must-choose-another-suit", "Choose a suit other than the upturned suit.";
    INVALID_BID = "invalid-bid", "A Contrée bid must be from 80 to 160 in steps of 10.";
    BID_TOO_LOW = "bid-too-low", "Your bid must be higher than the current contract.";
    COINCHE_NOT_ALLOWED = "coinche-not-allowed", "Only an opponent of the declaring team may coinche.";
    SUIT_REQUIRED = "suit-required", "Choose a trump suit for the contract.";

    NOT_STARTED = "not-started", "This game has not started.";
    AUCTION_NOT_FINISHED = "auction-not-finished", "The auction has not finished.";
    ROUND_NOT_FINISHED = "round-not-finished", "The current round is not finished.";
    MATCH_ENDED = "match-ended", "This match has ended. Start a rematch.";
    DAILY_OVER = "daily-over", "Today's daily deal is finished.";
    DAILY_PLAYED = "daily-played", "You have already played today's deal.";
    UNDO_UNAVAILABLE = "undo-unavailable", "There is nothing to undo.";
    UNDO_LIMIT_REACHED = "undo-limit-reached", "No undo is left for this match.";
    UNDO_TOO_LATE = "undo-too-late", "It is too late to undo that card.";
    REACTIONS_CLOSED = "reactions-closed", "Reactions open once the game starts.";
    SLOW_DOWN = "slow-down", "Slow down: wait a moment before reacting again.";
    INVALID_CODE = "invalid-code", "The invitation code is invalid.";

    // Sent by the routes outside a table, and by the error responses.
    NOT_FOUND = "not-found", "Not found.";
    BAD_REQUEST = "bad-request", "The request is not valid.";
    FORBIDDEN = "forbidden", "Forbidden";
    REAUTHENTICATE = "reauthenticate", "Sign in again to delete your account.";
    PAYLOAD_TOO_LARGE = "payload-too-large", "The request is too large.";
    RATE_LIMITED = "rate-limited", "Too many requests. Please slow down.";
    BUSY = "capacity-exceeded", "The server is busy. Please try again later.";
    SOLVER_BUSY = "solver-busy", "Hints and analyses are busy. Please try again in a moment.";
    INTERNAL = "internal", "Something went wrong. Please try again.";
    TABLE_UNAUTHORIZED = "unauthorized", "You are not authorized for this table.";
    SIGN_IN_FIRST = "sign-in-first", "Sign in first.";
    SIGN_IN_LEADERBOARD = "sign-in-leaderboard", "Sign in to choose whether you appear on the leaderboard.";
    SIGN_IN_STATISTICS = "sign-in-statistics", "Sign in to see your statistics.";
    SIGN_IN_RATING = "sign-in-rating", "Sign in to see your rating.";
    SIGN_IN_NAME = "sign-in-name", "Sign in to change your name.";
    SIGN_IN_FRIENDS = "sign-in-friends", "Sign in to use friends.";
    INVALID_FRIEND_LINK = "invalid-friend-link", "This friend link is not valid.";
    OWN_FRIEND_LINK = "own-friend-link", "This is your own friend link.";
    NOT_A_FRIEND = "not-a-friend", "You can only invite your friends.";
}

fn trump_display(trump: Option<Trump>) -> &'static str {
    trump.map_or("", Trump::display_name)
}

fn trump_param(trump: Option<Trump>) -> String {
    trump.map_or_else(String::new, |trump| trump_name(trump).to_owned())
}

/// A Contrée bid is 80 or more; below that, the bid is a Bulgarian game (US-215), named without a value.
const BULGARIAN_BID_LIMIT: i32 = 80;

/// `Pass`.
pub fn call_pass() -> Message {
    Message::fixed("call-pass", "Pass")
}

/// `Coinche!`.
pub fn call_coinche() -> Message {
    Message::fixed("call-coinche", "Coinche!")
}

/// `90 Hearts`.
pub fn call_bid(value: i32, trump: Option<Trump>) -> Message {
    if value < BULGARIAN_BID_LIMIT {
        return call_trump(trump);
    }
    Message::with(
        "call-bid",
        format!("{value} {}", trump_display(trump)),
        [("value", value.to_string()), ("trump", trump_param(trump))],
    )
}

/// The suit a player chose to play with: `Hearts`.
pub fn call_trump(trump: Option<Trump>) -> Message {
    Message::with(
        "call-trump",
        trump_display(trump).to_owned(),
        [("trump", trump_param(trump))],
    )
}

/// A call as players read it: `Pass`, `90 Hearts`, `Hearts` for a chosen trump, or `Coinche!`.
pub fn call_label(call: &SeatCall) -> Message {
    match call.r#type {
        CallType::Pass => call_pass(),
        CallType::Bid => call_bid(call.value, call.trump),
        CallType::Trump => call_trump(call.trump),
        CallType::Coinche => call_coinche(),
    }
}

/// The first line of an auction: eight (Contrée) or five (Classic) cards dealt.
pub fn auction_dealt(variant: Variant) -> Message {
    match variant {
        Variant::Contree => Message::fixed(
            "auction-dealt-contree",
            "Eight cards have been dealt. Bid from 80 to 160 or pass.",
        ),
        Variant::Bela => Message::fixed(
            "auction-dealt-bela",
            "Six cards have been dealt. Name the trump suit or say dalje (pass).",
        ),
        Variant::Bulgarian => Message::fixed(
            "auction-dealt-bulgarian",
            "Eight cards have been dealt. Bid a game, from clubs to all trumps, or pass.",
        ),
        Variant::Classic => Message::fixed(
            "auction-dealt-classic",
            "Five cards have been dealt. Accept the upturned suit or pass.",
        ),
        Variant::Klaberjass => Message::fixed(
            "auction-dealt-klaberjass",
            "Six cards have been dealt. Accept the upturned suit or pass.",
        ),
    }
}

/// The line after every seat passed: the cards are dealt again.
pub fn auction_redealt(variant: Variant) -> Message {
    match variant {
        Variant::Contree => Message::fixed(
            "auction-redealt-contree",
            "Everyone passed. The cards have been redealt.",
        ),
        Variant::Bulgarian => Message::fixed(
            "auction-redealt-bulgarian",
            "Everyone passed. The cards have been redealt.",
        ),
        // A Bela dealer cannot pass, so a Bela auction is never redealt; the text is the Classic one.
        Variant::Bela | Variant::Classic => Message::fixed(
            "auction-redealt-classic",
            "Everyone passed twice. The cards have been redealt.",
        ),
        Variant::Klaberjass => Message::fixed(
            "auction-redealt-klaberjass",
            "Both players passed twice. The cards have been redealt.",
        ),
    }
}

pub fn auction_deciding(name: &str) -> Message {
    Message::with(
        "auction-deciding",
        format!("{name} is deciding."),
        [("name", name.to_owned())],
    )
}

pub fn auction_bid(name: &str, value: i32, trump: Option<Trump>) -> Message {
    if value < BULGARIAN_BID_LIMIT {
        return Message::with(
            "auction-game",
            format!("{name} bids {}.", trump_display(trump)),
            [("name", name.to_owned()), ("trump", trump_param(trump))],
        );
    }
    Message::with(
        "auction-bid",
        format!("{name} bids {value} {}.", trump_display(trump)),
        [
            ("name", name.to_owned()),
            ("value", value.to_string()),
            ("trump", trump_param(trump)),
        ],
    )
}

pub fn auction_coinche(name: &str) -> Message {
    Message::with(
        "auction-coinche",
        format!("{name} coinches the contract."),
        [("name", name.to_owned())],
    )
}

/// Classic Belote, after four passes: any trump but the upturned suit.
pub fn auction_choose_trump(upturned: beelot_game::Suit) -> Message {
    Message::with(
        "auction-choose-trump",
        format!(
            "Everyone passed. Choose any trump suit except {}.",
            suit_name(upturned)
        ),
        [("suit", suit_name(upturned).to_owned())],
    )
}

pub fn auction_accepted(value: i32, trump: Option<Trump>) -> Message {
    if value < BULGARIAN_BID_LIMIT {
        return Message::with(
            "auction-game-accepted",
            format!("The {} game is accepted.", trump_display(trump)),
            [("trump", trump_param(trump))],
        );
    }
    Message::with(
        "auction-accepted",
        format!("The {value} {} contract is accepted.", trump_display(trump)),
        [("value", value.to_string()), ("trump", trump_param(trump))],
    )
}

pub fn declared_belote(name: &str) -> Message {
    Message::with(
        "declared-belote",
        format!("{name} declares Belote."),
        [("name", name.to_owned())],
    )
}

pub fn declared_rebelote(name: &str) -> Message {
    Message::with(
        "declared-rebelote",
        format!("{name} declares Rebelote: 20 bonus points."),
        [("name", name.to_owned())],
    )
}

/// What the auction says now, after each call. Choosing a trump leaves the message
/// as it was.
pub fn auction_message(
    bidding: &BiddingState,
    variant: Variant,
    name: impl Fn(usize) -> String,
) -> Message {
    let auction = bidding.auction();
    let Some(index) = auction
        .iter()
        .rposition(|call| call.r#type != CallType::Trump)
    else {
        return if bidding.deals() > 1 {
            auction_redealt(variant)
        } else {
            auction_dealt(variant)
        };
    };
    let call = &auction[index];
    let deciding = || auction_deciding(&name((call.seat + 1) % variant.seat_count()));
    match call.r#type {
        CallType::Bid => auction_bid(&name(call.seat), call.value, call.trump),
        CallType::Coinche => auction_coinche(&name(call.seat)),
        CallType::Pass
            if variant != Variant::Contree
                && index + 1 == variant.seat_count()
                && bidding.round() == 2 =>
        {
            let upturned = bidding
                .upturned_card()
                .expect("Classic Belote turns a card up");
            auction_choose_trump(upturned.suit)
        }
        CallType::Pass
            if matches!(variant, Variant::Contree | Variant::Bulgarian)
                && bidding.completed_board().is_some() =>
        {
            auction_accepted(bidding.highest_bid(), bidding.highest_bid_suit())
        }
        CallType::Pass | CallType::Trump => deciding(),
    }
}

/// The suit's upper-case name: `HEARTS`.
pub fn suit_name(suit: beelot_game::Suit) -> &'static str {
    match suit {
        beelot_game::Suit::Clubs => "CLUBS",
        beelot_game::Suit::Diamonds => "DIAMONDS",
        beelot_game::Suit::Hearts => "HEARTS",
        beelot_game::Suit::Spades => "SPADES",
    }
}

/// The trump's upper-case name: `HEARTS`, `ALL_TRUMPS` or `NO_TRUMPS`.
pub fn trump_name(trump: Trump) -> &'static str {
    match trump {
        Trump::AllTrumps => "ALL_TRUMPS",
        Trump::NoTrumps => "NO_TRUMPS",
        suit => suit_name(suit.suit().expect("a suit contract")),
    }
}

/// The latest Belote announcement of the round, once its first card is played.
pub fn declaration(board: &GameBoard, name: impl Fn(usize) -> String) -> Option<Message> {
    board
        .last_belote()
        .map(|BeloteDeclaration { seat, rebelote }| match rebelote {
            false => declared_belote(&name(seat)),
            true => declared_rebelote(&name(seat)),
        })
}

/// Every message the server can send, with samples for those that take parameters: the list the frontend tests
/// check against its dictionaries (`frontend-tests/fixtures/message-catalogue.json`).
pub fn catalogue() -> Vec<Message> {
    const TRUMPS: [Trump; 6] = [
        Trump::Clubs,
        Trump::Diamonds,
        Trump::Hearts,
        Trump::Spades,
        Trump::AllTrumps,
        Trump::NoTrumps,
    ];
    let mut all = fixed_messages();
    all.push(call_pass());
    all.push(call_coinche());
    for trump in TRUMPS {
        for value in [1, 90, 160] {
            // A Bulgarian bid on a suit reads as the trump call listed below: list it once.
            if value < BULGARIAN_BID_LIMIT && trump.suit().is_some() {
                all.push(auction_accepted(value, Some(trump)));
                continue;
            }
            all.push(call_bid(value, Some(trump)));
            all.push(auction_accepted(value, Some(trump)));
        }
    }
    for trump in &TRUMPS[..4] {
        all.push(call_trump(Some(*trump)));
        all.push(auction_choose_trump(trump.suit().expect("a suit")));
    }
    for variant in [Variant::Contree, Variant::Classic, Variant::Bulgarian, Variant::Klaberjass] {
        all.push(auction_dealt(variant));
        all.push(auction_redealt(variant));
    }
    // A Bela auction is never redealt: only its first line is a message of its own.
    all.push(auction_dealt(Variant::Bela));
    for name in ["You", "Chloe"] {
        all.push(auction_deciding(name));
        all.push(auction_coinche(name));
        all.push(declared_belote(name));
        all.push(declared_rebelote(name));
        for trump in TRUMPS {
            for value in [1, 90, 160] {
                all.push(auction_bid(name, value, Some(trump)));
            }
        }
    }
    all
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    /// Only this module makes messages (the constructors are private), and every code it makes is listed, so the
    /// frontend tests know every code the server can send.
    #[test]
    fn the_catalogue_lists_every_code_the_module_can_make() {
        let listed: BTreeSet<&str> = catalogue().iter().map(|message| message.code).collect();
        let source = include_str!("messages.rs");
        let mut found = 0;
        for constructor in ["Message::with(", "Message::fixed("] {
            for part in source.split(constructor).skip(1) {
                let Some(rest) = part.trim_start().strip_prefix('"') else {
                    continue;
                };
                let code = &rest[..rest.find('"').unwrap_or(0)];
                if code.is_empty() || !code.chars().all(|c| c.is_ascii_lowercase() || c == '-') {
                    continue;
                }
                found += 1;
                assert!(listed.contains(code), "{code} is not in the catalogue");
            }
        }
        assert!(found >= 15, "the scan finds the constructors");
    }

    #[test]
    fn the_codes_of_the_fixed_messages_are_listed_once() {
        let mut seen = BTreeSet::new();
        for message in fixed_messages() {
            assert!(
                seen.insert(message.code),
                "{} is defined twice",
                message.code
            );
        }
    }
}
