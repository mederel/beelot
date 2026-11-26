//! The auction before a round: Classic accept-or-pass on an upturned card, Contrée bidding.

use serde::{Deserialize, Serialize};

use crate::board::GameBoard;
use crate::card::{Card, Seat, Suit, Trump, Variant};
use crate::deck::{Deck, Gathering};
use crate::error::GameError;
use crate::rng::RandomSource;

/// The rank of a Bulgarian game in the auction: clubs < diamonds < hearts < spades < no trumps < all trumps (US-215).
pub fn bulgarian_rank(trump: Trump) -> i32 {
    match trump {
        Trump::Clubs => 1,
        Trump::Diamonds => 2,
        Trump::Hearts => 3,
        Trump::Spades => 4,
        Trump::NoTrumps => 5,
        Trump::AllTrumps => 6,
    }
}

/// Serializes `Option<Seat>` as the seat, or `-1` for `None`.
mod minus_one_none {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    use crate::card::Seat;

    pub fn serialize<S: Serializer>(
        value: &Option<Seat>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match value {
            Some(seat) => (*seat as i64).serialize(serializer),
            None => (-1_i64).serialize(serializer),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<Seat>, D::Error> {
        let value = i64::deserialize(deserializer)?;
        Ok(usize::try_from(value).ok())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CallType {
    Pass,
    Bid,
    Trump,
    Coinche,
}

/// A call made from the given seat; `value` is set for a bid, `trump` for a bid or a chosen trump.
/// The fixtures recorded before US-063 name the trump `suit`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeatCall {
    pub seat: Seat,
    #[serde(rename = "type")]
    pub r#type: CallType,
    pub value: i32,
    #[serde(rename = "suit", alias = "trump")]
    pub trump: Option<Trump>,
}

/// A seat's view of the auction, for bots. `highest_bidder_seat` is `-1` in JSON before the first bid.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuctionView {
    pub seat: Seat,
    pub hand: Vec<Card>,
    pub upturned_card: Option<Card>,
    pub round: i32,
    pub variant: Variant,
    pub dealer_index: Seat,
    pub auction: Vec<SeatCall>,
    pub highest_bid: i32,
    pub highest_bid_suit: Option<Trump>,
    #[serde(with = "minus_one_none")]
    pub highest_bidder_seat: Option<Seat>,
    pub coinche_allowed: bool,
    pub announcements: bool,
    /// Whether bids may name all trumps or no trumps (US-063); off in fixtures recorded before.
    #[serde(default)]
    pub all_trumps: bool,
}

impl AuctionView {
    /// Whether this player's partner holds the highest bid.
    pub fn partner_holds_contract(&self) -> bool {
        self.highest_bidder_seat
            .is_some_and(|bidder| bidder != self.seat && bidder % 2 == self.seat % 2)
    }

    /// Whether this player has already made a contract bid in this auction.
    pub fn has_bid(&self) -> bool {
        self.auction
            .iter()
            .any(|call| call.seat == self.seat && call.r#type == CallType::Bid)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuctionDecision {
    Pass,
    /// A Contrée bid in a suit, all trumps or no trumps.
    Bid {
        value: i32,
        #[serde(rename = "suit")]
        trump: Trump,
    },
    Coinche,
    Trump {
        suit: Suit,
    },
}

/// How the cards of a deal came to the players, without showing any card (US-085): how the deck
/// was put together (with the trick piles' sizes and which went on top), who dealt, who cut and how
/// many cards they lifted, and the packets dealt in order. Seats are numbered in play order from 0.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DealSummary {
    pub gathering: Gathering,
    pub north_south_pile: usize,
    pub east_west_pile: usize,
    pub north_south_on_top: bool,
    pub dealer_seat: Seat,
    pub cutter_seat: Seat,
    pub cut_lifted: usize,
    pub packets: Vec<DealPacket>,
}

/// A packet of cards dealt face down to the given seat.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DealPacket {
    pub seat: Seat,
    pub cards: usize,
}

pub struct BiddingState {
    variant: Variant,
    rng: Box<dyn RandomSource + Send>,
    deals: u32,
    hands: [Vec<Card>; 4],
    remaining_deck: Vec<Card>,
    upturned_card: Option<Card>,
    deal_summary: Option<DealSummary>,
    dealer: Seat,
    active: Seat,
    round: i32,
    consecutive_passes: usize,
    highest_bid: i32,
    highest_bidder: Option<Seat>,
    highest_bid_suit: Option<Trump>,
    coinched: bool,
    completed_board: Option<GameBoard>,
    auction: Vec<SeatCall>,
    announcements: bool,
    all_trumps: bool,
}

impl std::fmt::Debug for BiddingState {
    /// Leaves out the random source.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BiddingState")
            .field("variant", &self.variant)
            .field("deals", &self.deals)
            .field("hands", &self.hands)
            .field("remaining_deck", &self.remaining_deck)
            .field("upturned_card", &self.upturned_card)
            .field("deal_summary", &self.deal_summary)
            .field("dealer", &self.dealer)
            .field("active", &self.active)
            .field("round", &self.round)
            .field("consecutive_passes", &self.consecutive_passes)
            .field("highest_bid", &self.highest_bid)
            .field("highest_bidder", &self.highest_bidder)
            .field("highest_bid_suit", &self.highest_bid_suit)
            .field("coinched", &self.coinched)
            .field("completed_board", &self.completed_board)
            .field("auction", &self.auction)
            .field("announcements", &self.announcements)
            .field("all_trumps", &self.all_trumps)
            .finish_non_exhaustive()
    }
}

impl BiddingState {
    /// The first deal of a match, from a shuffled deck: the same seeded generator gives the same
    /// deals. The seat to the dealer's left speaks first and leads the first trick.
    pub fn new(variant: Variant, dealer: Seat, rng: Box<dyn RandomSource + Send>) -> Self {
        Self::dealt_from(variant, dealer, rng, None)
    }

    /// Deals from the given deck, gathered from the previous deal (US-085): the player before the
    /// dealer cuts it at a random point, then the dealer deals. Without a deck, a shuffled one is
    /// dealt, for the first deal of a match.
    pub fn dealt_from(
        variant: Variant,
        dealer: Seat,
        rng: Box<dyn RandomSource + Send>,
        deck: Option<Deck>,
    ) -> Self {
        let mut state = BiddingState {
            variant,
            rng,
            deals: 0,
            hands: Default::default(),
            remaining_deck: Vec::new(),
            upturned_card: None,
            deal_summary: None,
            dealer: dealer % variant.seat_count(),
            active: 0,
            round: 1,
            consecutive_passes: 0,
            highest_bid: 0,
            highest_bidder: None,
            highest_bid_suit: None,
            coinched: false,
            completed_board: None,
            auction: Vec::new(),
            announcements: false,
            all_trumps: false,
        };
        let deck = deck.unwrap_or_else(|| Deck::shuffled(&mut *state.rng));
        state.deal(deck);
        state
    }

    /// A classic deal whose auction is already over: the given hands, played with `trump` taken by `declarer`. Nothing
    /// is dealt, shuffled or cut, so the same arguments always give the same round (a tutorial's lessons, US-199).
    pub fn preset(
        dealer: Seat,
        hands: [Vec<Card>; 4],
        trump: Suit,
        declarer: Seat,
        rng: Box<dyn RandomSource + Send>,
    ) -> Self {
        let board = GameBoard::from_bidding(hands.clone(), trump, declarer, dealer, false);
        Self {
            variant: Variant::Classic,
            rng,
            deals: 1,
            hands,
            remaining_deck: Vec::new(),
            upturned_card: None,
            deal_summary: Some(DealSummary {
                gathering: crate::deck::Gathering::Shuffled,
                north_south_pile: 0,
                east_west_pile: 0,
                north_south_on_top: false,
                dealer_seat: dealer % 4,
                cutter_seat: (dealer + 3) % 4,
                cut_lifted: 0,
                packets: Vec::new(),
            }),
            dealer: dealer % 4,
            active: (dealer + 1) % 4,
            round: 1,
            consecutive_passes: 0,
            highest_bid: 0,
            highest_bidder: Some(declarer),
            highest_bid_suit: Some(trump.into()),
            coinched: false,
            completed_board: Some(board),
            auction: Vec::new(),
            announcements: false,
            all_trumps: false,
        }
    }

    /// Whether the board of this deal lets players declare announcements; off unless set.
    pub fn with_announcements(mut self, on: bool) -> Self {
        self.announcements = on;
        self
    }

    pub fn announcements(&self) -> bool {
        self.announcements
    }

    /// Whether Contrée bids may name all trumps or no trumps (US-063); off unless set.
    pub fn with_all_trumps(mut self, on: bool) -> Self {
        self.all_trumps = on;
        self
    }

    pub fn all_trumps(&self) -> bool {
        self.all_trumps
    }

    pub fn pass(&mut self, seat: Seat) -> Result<(), GameError> {
        self.require_active(seat)?;
        if self.variant == Variant::Bela && seat == self.dealer {
            return Err(GameError::DealerMustChooseTrump);
        }
        self.record_call(seat, CallType::Pass, 0, None);
        if self.variant == Variant::Bela {
            self.active = (self.active + 1) % 4;
            return Ok(());
        }
        if !matches!(self.variant, Variant::Classic | Variant::Klaberjass) {
            self.pass_contree();
            return Ok(());
        }
        self.consecutive_passes += 1;
        self.active = (self.active + 1) % self.seats();
        if self.consecutive_passes != self.seats() {
            return Ok(());
        }
        if self.round == 1 {
            self.round = 2;
            self.consecutive_passes = 0;
            self.active = self.first_bidder();
            return Ok(());
        }
        self.redeal();
        Ok(())
    }

    pub fn choose_trump(&mut self, seat: Seat, trump: Suit) -> Result<(), GameError> {
        if self.variant == Variant::Bela {
            return self.name_bela_trump(seat, trump);
        }
        if !matches!(self.variant, Variant::Classic | Variant::Klaberjass) {
            return Err(GameError::TrumpChoiceOnlyInClassic);
        }
        self.require_active(seat)?;
        let upturned = self
            .upturned_card
            .expect("Classic deals an upturned card")
            .suit;
        if self.round == 1 && trump != upturned {
            return Err(GameError::MustTakeUpturnedSuit);
        }
        if self.round == 2 && trump == upturned {
            return Err(GameError::MustChooseAnotherSuit);
        }
        self.record_call(seat, CallType::Trump, 0, Some(trump.into()));
        let mut hands = self.hands.clone();
        if self.variant == Variant::Klaberjass {
            // Three more cards each, the non-dealer first; the turned-up card goes back to the
            // talon (US-219).
            for offset in 1..=self.seats() {
                let dealt = (self.dealer + offset) % self.seats();
                hands[dealt].extend(self.remaining_deck.drain(..3));
            }
            self.completed_board = Some(GameBoard::from_klaberjass(
                hands,
                trump,
                self.active,
                self.dealer,
            ));
            return Ok(());
        }
        // The taker picks up the upturned card; the dealer then deals the rest from the player
        // after them.
        hands[seat].push(self.upturned_card.expect("Classic deals an upturned card"));
        for offset in 1..=4 {
            let dealt = (self.dealer + offset) % 4;
            let extra = if dealt == self.active { 2 } else { 3 };
            hands[dealt].extend(self.remaining_deck.drain(..extra));
        }
        self.completed_board = Some(GameBoard::from_bidding(
            hands,
            trump,
            self.active,
            self.dealer,
            self.announcements,
        ));
        Ok(())
    }

    /// Bela: the seat names the trump suit; the dealer then deals two more cards to each player.
    fn name_bela_trump(&mut self, seat: Seat, trump: Suit) -> Result<(), GameError> {
        self.require_active(seat)?;
        self.record_call(seat, CallType::Trump, 0, Some(trump.into()));
        let mut hands = self.hands.clone();
        for offset in 1..=4 {
            let dealt = (self.dealer + offset) % 4;
            hands[dealt].extend(self.remaining_deck.drain(..2));
        }
        self.completed_board = Some(GameBoard::from_bela(hands, trump, seat, self.dealer));
        Ok(())
    }

    /// A Contrée bid. It must be higher than the highest bid; a contract of all trumps or no trumps
    /// at the same value does not overcall a suit (FFB §4.1 b).
    pub fn bid(&mut self, seat: Seat, value: i32, trump: Trump) -> Result<(), GameError> {
        if self.variant == Variant::Bulgarian {
            return self.bid_bulgarian(seat, value, trump);
        }
        self.require_contree()?;
        self.require_active(seat)?;
        if !self.all_trumps && !trump.suit_contract() {
            return Err(GameError::AllTrumpsNotPlayed);
        }
        if !(80..=160).contains(&value) || value % 10 != 0 {
            return Err(GameError::InvalidBid);
        }
        if value <= self.highest_bid {
            return Err(GameError::BidTooLow);
        }
        self.highest_bid = value;
        self.highest_bid_suit = Some(trump);
        self.highest_bidder = Some(self.active);
        self.record_call(seat, CallType::Bid, value, Some(trump));
        self.consecutive_passes = 0;
        self.active = (self.active + 1) % 4;
        Ok(())
    }

    /// A Bulgarian bid (US-215): the game's rank, clubs 1 to all trumps 6, must beat the last bid.
    fn bid_bulgarian(&mut self, seat: Seat, value: i32, trump: Trump) -> Result<(), GameError> {
        self.require_active(seat)?;
        if value != bulgarian_rank(trump) {
            return Err(GameError::InvalidBid);
        }
        if value <= self.highest_bid {
            return Err(GameError::BidTooLow);
        }
        self.highest_bid = value;
        self.highest_bid_suit = Some(trump);
        self.highest_bidder = Some(self.active);
        self.record_call(seat, CallType::Bid, value, Some(trump));
        self.consecutive_passes = 0;
        self.active = (self.active + 1) % 4;
        Ok(())
    }

    pub fn coinche(&mut self, seat: Seat) -> Result<(), GameError> {
        self.require_contree()?;
        self.require_active(seat)?;
        match self.highest_bidder {
            Some(bidder) if bidder % 2 != self.active % 2 => {}
            _ => return Err(GameError::CoincheNotAllowed),
        }
        self.coinched = true;
        self.record_call(seat, CallType::Coinche, 0, None);
        self.complete_contree_auction();
        Ok(())
    }

    /// Applies a bot's decision to the matching call.
    pub fn apply(&mut self, seat: Seat, decision: AuctionDecision) -> Result<(), GameError> {
        match decision {
            AuctionDecision::Pass => self.pass(seat),
            AuctionDecision::Bid { value, trump } => self.bid(seat, value, trump),
            AuctionDecision::Coinche => self.coinche(seat),
            AuctionDecision::Trump { suit } => self.choose_trump(seat, suit),
        }
    }

    /// What the given seat can see when making a call: its own hand, the upturned card and the auction.
    pub fn auction_view(&self, seat: Seat) -> AuctionView {
        AuctionView {
            seat,
            hand: self.hands[seat].clone(),
            upturned_card: self.upturned_card,
            round: self.round,
            variant: self.variant,
            dealer_index: self.dealer,
            auction: self.auction.clone(),
            highest_bid: self.highest_bid,
            highest_bid_suit: self.highest_bid_suit,
            highest_bidder_seat: self.highest_bidder,
            coinche_allowed: self.can_coinche(seat),
            announcements: self.announcements,
            all_trumps: self.all_trumps,
        }
    }

    pub fn active_seat(&self) -> Seat {
        self.active
    }

    pub fn dealer(&self) -> Seat {
        self.dealer
    }

    /// How the cards of the current deal were dealt.
    pub fn deal_summary(&self) -> &DealSummary {
        self.deal_summary
            .as_ref()
            .expect("a bidding state has dealt")
    }

    /// How many times the cards have been dealt, counting redeals after everyone passed.
    pub fn deals(&self) -> u32 {
        self.deals
    }

    pub fn round(&self) -> i32 {
        self.round
    }

    pub fn hand(&self, seat: Seat) -> &[Card] {
        &self.hands[seat]
    }

    pub fn upturned_card(&self) -> Option<Card> {
        self.upturned_card
    }

    pub fn highest_bid(&self) -> i32 {
        self.highest_bid
    }

    pub fn highest_bid_suit(&self) -> Option<Trump> {
        self.highest_bid_suit
    }

    pub fn highest_bidder(&self) -> Option<Seat> {
        self.highest_bidder
    }

    pub fn auction(&self) -> &[SeatCall] {
        &self.auction
    }

    pub fn can_coinche(&self, seat: Seat) -> bool {
        self.variant == Variant::Contree
            && self.completed_board.is_none()
            && self.active == seat
            && self
                .highest_bidder
                .is_some_and(|bidder| seat % 2 != bidder % 2)
    }

    pub fn completed_board(&self) -> Option<&GameBoard> {
        self.completed_board.as_ref()
    }

    pub fn into_board(self) -> Option<GameBoard> {
        self.completed_board
    }

    fn record_call(&mut self, seat: Seat, call: CallType, value: i32, trump: Option<Trump>) {
        self.auction.push(SeatCall {
            seat,
            r#type: call,
            value,
            trump,
        });
    }

    /// How many seats play this auction's variant.
    fn seats(&self) -> usize {
        self.variant.seat_count()
    }

    fn first_bidder(&self) -> Seat {
        (self.dealer + 1) % self.seats()
    }

    /// After everyone passed, the dealer gathers the hands without a shuffle, from the player after
    /// them in play order, each hand in the order it was dealt, then the upturned card and the rest
    /// of the deck. The deal passes to the next player.
    fn redeal(&mut self) {
        let mut gathered = Vec::with_capacity(crate::deck::SIZE);
        for offset in 1..=self.seats() {
            gathered.extend_from_slice(&self.hands[(self.dealer + offset) % self.seats()]);
        }
        gathered.extend(self.upturned_card);
        gathered.append(&mut self.remaining_deck);
        self.dealer = (self.dealer + 1) % self.seats();
        self.deal(Deck::gathered_hands(gathered));
    }

    /// The player before the dealer cuts, then the dealer deals packets of 3 then 2 cards (then 3
    /// more in Contrée; 3 then 3 in Bela, which deals 2 more once trumps are named) to each player, from the player after them; in classic Belote the next card
    /// is turned up.
    fn deal(&mut self, deck: Deck) {
        let cutter = (self.dealer + self.seats() - 1) % self.seats();
        let cut = deck.cut(&mut *self.rng);
        let mut cards = cut.cards.into_iter();
        self.deals += 1;
        self.hands = Default::default();
        let sizes: &[usize] = match self.variant {
            Variant::Contree | Variant::Bulgarian => &[3, 2, 3],
            Variant::Bela | Variant::Klaberjass => &[3, 3],
            Variant::Classic => &[3, 2],
        };
        let mut packets = Vec::with_capacity(sizes.len() * self.seats());
        for &size in sizes {
            for offset in 1..=self.seats() {
                let seat = (self.dealer + offset) % self.seats();
                self.hands[seat].extend(cards.by_ref().take(size));
                packets.push(DealPacket { seat, cards: size });
            }
        }
        self.upturned_card = if matches!(self.variant, Variant::Classic | Variant::Klaberjass) {
            cards.next()
        } else {
            None
        };
        self.remaining_deck = cards.collect();
        self.deal_summary = Some(DealSummary {
            gathering: deck.gathering(),
            north_south_pile: deck.north_south_pile(),
            east_west_pile: deck.east_west_pile(),
            north_south_on_top: deck.north_south_on_top(),
            dealer_seat: self.dealer,
            cutter_seat: cutter,
            cut_lifted: cut.lifted,
            packets,
        });
        self.active = self.first_bidder();
        self.round = 1;
        self.consecutive_passes = 0;
        self.highest_bid = 0;
        self.highest_bidder = None;
        self.highest_bid_suit = None;
        self.coinched = false;
        self.completed_board = None;
        self.auction.clear();
    }

    fn pass_contree(&mut self) {
        self.consecutive_passes += 1;
        if self.highest_bidder.is_some() && self.consecutive_passes == 3 {
            self.complete_contree_auction();
            return;
        }
        self.active = (self.active + 1) % 4;
        if self.highest_bidder.is_none() && self.consecutive_passes == 4 {
            self.redeal();
        }
    }

    fn complete_contree_auction(&mut self) {
        let (Some(trump), Some(declarer)) = (self.highest_bid_suit, self.highest_bidder) else {
            return;
        };
        if self.variant == Variant::Bulgarian {
            self.completed_board = Some(GameBoard::from_bulgarian(
                self.hands.clone(),
                trump,
                declarer,
                self.dealer,
                self.announcements,
            ));
            return;
        }
        self.completed_board = Some(GameBoard::from_contract(
            self.hands.clone(),
            trump,
            declarer,
            self.highest_bid,
            self.coinched,
            self.dealer,
            self.announcements,
        ));
    }

    fn require_contree(&self) -> Result<(), GameError> {
        if self.variant == Variant::Contree {
            Ok(())
        } else {
            Err(GameError::ContractOnlyInContree)
        }
    }

    fn require_active(&self, seat: Seat) -> Result<(), GameError> {
        if self.completed_board.is_some() {
            return Err(GameError::AuctionEnded);
        }
        if self.active != seat {
            return Err(GameError::NotYourTurn);
        }
        Ok(())
    }
}
