package fr.beelot.game;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.random.RandomGenerator;

public final class BiddingState {

    private final List<GameBoard.GamePlayer> players;
    private final GameVariant variant;
    private final RandomGenerator random;
    private int deals;
    private Map<UUID, List<GameCard>> hands;
    private List<GameCard> remainingDeck;
    private GameCard upturnedCard;
    private int dealerIndex;
    private int activePlayerIndex;
    private int round = 1;
    private int consecutivePasses;
    private int highestBid;
    private int highestBidderIndex = -1;
    private GameCard.Suit highestBidSuit;
    private boolean coinched;
    private GameBoard completedBoard;
    private final Map<UUID, String> latestCalls = new HashMap<>();
    private final List<AuctionCall> auction = new ArrayList<>();
    private final List<SeatCall> seatCalls = new ArrayList<>();
    private UUID auctionId;
    private String message;

    public BiddingState(List<GameBoard.GamePlayer> players) {
        this(players, GameVariant.CLASSIC);
    }

    public BiddingState(List<GameBoard.GamePlayer> players, GameVariant variant) {
        this(players, variant, players.size() - 1);
    }

    /** The dealer deals, then the player to the dealer's left speaks first and leads the first trick. */
    public BiddingState(List<GameBoard.GamePlayer> players, GameVariant variant, int dealerIndex) {
        this(players, variant, dealerIndex, new SecureRandom());
    }

    /** Deals with the given random generator: the same seeded generator gives the same deals. */
    public BiddingState(List<GameBoard.GamePlayer> players, GameVariant variant, int dealerIndex,
                        RandomGenerator random) {
        if (players.size() != 4) {
            throw new IllegalArgumentException("A Belote table needs four players.");
        }
        this.players = List.copyOf(players);
        this.variant = variant;
        this.random = random;
        this.dealerIndex = Math.floorMod(dealerIndex, players.size());
        dealAgain(variant == GameVariant.CONTREE
                ? "Eight cards have been dealt. Bid from 80 to 160 or pass."
                : "Five cards have been dealt. Accept the upturned suit or pass.");
    }

    public synchronized void pass(UUID playerId) {
        requireActivePlayer(playerId);
        recordCall(playerId, "Pass", CallType.PASS, 0, null);
        if (variant == GameVariant.CONTREE) {
            passContree();
            return;
        }
        consecutivePasses++;
        activePlayerIndex = (activePlayerIndex + 1) % players.size();
        if (consecutivePasses != players.size()) {
            message = players.get(activePlayerIndex).name() + " is deciding.";
            return;
        }
        if (round == 1) {
            round = 2;
            consecutivePasses = 0;
            activePlayerIndex = firstBidderIndex();
            message = "Everyone passed. Choose any trump suit except " + upturnedCard.suit().name() + ".";
            return;
        }
        dealerIndex = (dealerIndex + 1) % players.size();
        dealAgain("Everyone passed twice. The cards have been redealt.");
    }

    public synchronized GameBoard chooseTrump(UUID playerId, GameCard.Suit trump) {
        if (variant != GameVariant.CLASSIC) {
            throw new PrivateTableConflictException("Choose a contract value and suit in Contrée.");
        }
        requireActivePlayer(playerId);
        if (round == 1 && trump != upturnedCard.suit()) {
            throw new PrivateTableConflictException("In the first round, you may only accept the upturned suit.");
        }
        if (round == 2 && trump == upturnedCard.suit()) {
            throw new PrivateTableConflictException("Choose a suit other than the upturned suit.");
        }
        recordCall(playerId, trump.displayName(), CallType.TRUMP, 0, trump);
        Map<UUID, List<GameCard>> completeHands = new HashMap<>();
        for (GameBoard.GamePlayer player : players) {
            completeHands.put(player.playerId(), new ArrayList<>(hands.get(player.playerId())));
        }
        for (int index = 0; index < players.size(); index++) {
            int extraCards = index == activePlayerIndex ? 2 : 3;
            for (int card = 0; card < extraCards; card++) {
                completeHands.get(players.get(index).playerId()).add(remainingDeck.removeFirst());
            }
        }
        completeHands.get(playerId).add(upturnedCard);
        completedBoard = GameBoard.fromBidding(players, completeHands, trump, activePlayerIndex, dealerIndex);
        return completedBoard;
    }

    public synchronized void bid(UUID playerId, int value, GameCard.Suit suit) {
        requireContree();
        requireActivePlayer(playerId);
        if (suit == null) {
            throw new PrivateTableConflictException("Choose a trump suit for the contract.");
        }
        if (value < 80 || value > 160 || value % 10 != 0) {
            throw new PrivateTableConflictException("A Contrée bid must be from 80 to 160 in steps of 10.");
        }
        if (value <= highestBid) {
            throw new PrivateTableConflictException("Your bid must be higher than the current contract.");
        }
        highestBid = value;
        highestBidSuit = suit;
        highestBidderIndex = activePlayerIndex;
        recordCall(playerId, value + " " + suit.displayName(), CallType.BID, value, suit);
        consecutivePasses = 0;
        activePlayerIndex = (activePlayerIndex + 1) % players.size();
        message = players.get(highestBidderIndex).name() + " bids " + value + " " + suit.displayName() + ".";
    }

    public synchronized void coinche(UUID playerId) {
        requireContree();
        requireActivePlayer(playerId);
        if (highestBidderIndex < 0 || highestBidderIndex % 2 == activePlayerIndex % 2) {
            throw new PrivateTableConflictException("Only an opponent of the declaring team may coinche.");
        }
        coinched = true;
        recordCall(playerId, "Coinche!", CallType.COINCHE, 0, null);
        message = players.get(activePlayerIndex).name() + " coinches the contract.";
        completeContreeAuction();
    }

    public synchronized BiddingView viewFor(UUID playerId) {
        List<GameCard> orderedHand = hands.get(playerId).stream().sorted(GameCard.displayOrder(null)).toList();
        return new BiddingView(orderedHand, upturnedCard, round,
                players.get(activePlayerIndex).name(), players.get(activePlayerIndex).playerId().equals(playerId), message,
                variant, highestBid, highestBidSuit, highestBidderIndex < 0 ? "" : players.get(highestBidderIndex).name(),
                canCoinche(playerId), completedBoard != null, dealerIndex, players.stream()
                .map(player -> new PlayerCall(player.name(), latestCalls.getOrDefault(player.playerId(), ""),
                        player.playerId().equals(activePlayerId())))
                .toList(), auctionId, List.copyOf(auction));
    }

    /** What the given player can see when making a call: their own hand, the upturned card and the auction. */
    public synchronized AuctionView auctionViewFor(UUID playerId) {
        return new AuctionView(playerIndex(playerId), List.copyOf(hands.get(playerId)), upturnedCard, round, variant,
                dealerIndex, List.copyOf(seatCalls), highestBid, highestBidSuit, highestBidderIndex,
                canCoinche(playerId));
    }

    public synchronized UUID activePlayerId() {
        return players.get(activePlayerIndex).playerId();
    }

    public synchronized int dealerIndex() {
        return dealerIndex;
    }

    /** How many times the cards have been dealt, counting redeals after everyone passed. */
    public synchronized int deals() {
        return deals;
    }

    public synchronized GameBoard completedBoard() {
        return completedBoard;
    }

    private void recordCall(UUID playerId, String call, CallType type, int value, GameCard.Suit suit) {
        latestCalls.put(playerId, call);
        auction.add(new AuctionCall(players.get(playerIndex(playerId)).name(), call));
        seatCalls.add(new SeatCall(playerIndex(playerId), type, value, suit));
    }

    private int firstBidderIndex() {
        return (dealerIndex + 1) % players.size();
    }

    private void dealAgain(String dealMessage) {
        List<GameCard> deck = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) {
                deck.add(new GameCard(rank, suit));
            }
        }
        Collections.shuffle(deck, random);
        deals++;
        hands = new HashMap<>();
        int cardsPerPlayer = variant == GameVariant.CONTREE ? 8 : 5;
        for (GameBoard.GamePlayer player : players) {
            List<GameCard> hand = new ArrayList<>();
            for (int card = 0; card < cardsPerPlayer; card++) {
                hand.add(deck.removeFirst());
            }
            hands.put(player.playerId(), hand);
        }
        upturnedCard = variant == GameVariant.CLASSIC ? deck.removeFirst() : null;
        remainingDeck = deck;
        activePlayerIndex = firstBidderIndex();
        round = 1;
        consecutivePasses = 0;
        highestBid = 0;
        highestBidderIndex = -1;
        highestBidSuit = null;
        coinched = false;
        completedBoard = null;
        latestCalls.clear();
        auction.clear();
        seatCalls.clear();
        auctionId = UUID.randomUUID();
        message = dealMessage;
    }

    private void passContree() {
        consecutivePasses++;
        if (highestBidderIndex >= 0 && consecutivePasses == 3) {
            message = "The " + highestBid + " " + highestBidSuit.displayName() + " contract is accepted.";
            completeContreeAuction();
            return;
        }
        activePlayerIndex = (activePlayerIndex + 1) % players.size();
        if (highestBidderIndex < 0 && consecutivePasses == players.size()) {
            dealerIndex = (dealerIndex + 1) % players.size();
            dealAgain("Everyone passed. The cards have been redealt.");
        } else {
            message = players.get(activePlayerIndex).name() + " is deciding.";
        }
    }

    private void completeContreeAuction() {
        completedBoard = GameBoard.fromContract(players, hands, highestBidSuit, highestBidderIndex,
                highestBid, coinched, dealerIndex);
    }

    private boolean canCoinche(UUID playerId) {
        return variant == GameVariant.CONTREE && highestBidderIndex >= 0 && completedBoard == null
                && activePlayerId().equals(playerId) && playerIndex(playerId) % 2 != highestBidderIndex % 2;
    }

    private int playerIndex(UUID playerId) {
        for (int index = 0; index < players.size(); index++) {
            if (players.get(index).playerId().equals(playerId)) return index;
        }
        return -1;
    }

    private void requireContree() {
        if (variant != GameVariant.CONTREE) {
            throw new PrivateTableConflictException("Contract bids are only available in Contrée.");
        }
    }

    private void requireActivePlayer(UUID playerId) {
        if (completedBoard != null) throw new PrivateTableConflictException("The auction has ended.");
        if (!activePlayerId().equals(playerId)) {
            throw new PrivateTableConflictException("It is not your turn to bid.");
        }
    }

    public record BiddingView(List<GameCard> hand, GameCard upturnedCard, int round, String activePlayer,
                              boolean playerTurn, String message, GameVariant variant, int highestBid,
                              GameCard.Suit highestBidSuit, String highestBidder, boolean coincheAllowed,
                              boolean complete, int dealerIndex, List<PlayerCall> calls,
                              UUID auctionId, List<AuctionCall> auction) {
    }

    /**
     * A player's view of the auction, for bots: seats are numbered in play order from 0 (North–South hold the even
     * seats), and {@code highestBidderSeat} is -1 before the first bid.
     */
    public record AuctionView(int seat, List<GameCard> hand, GameCard upturnedCard, int round, GameVariant variant,
                              int dealerIndex, List<SeatCall> auction, int highestBid, GameCard.Suit highestBidSuit,
                              int highestBidderSeat, boolean coincheAllowed) {

        /** Whether this player's partner holds the highest bid. */
        public boolean partnerHoldsContract() {
            return highestBidderSeat >= 0 && highestBidderSeat != seat && highestBidderSeat % 2 == seat % 2;
        }

        /** Whether this player has already made a contract bid in this auction. */
        public boolean hasBid() {
            return auction.stream().anyMatch(call -> call.seat() == seat && call.type() == CallType.BID);
        }
    }

    /** A call made from the given seat; {@code value} is set for a bid, {@code suit} for a bid or a chosen trump. */
    public record SeatCall(int seat, CallType type, int value, GameCard.Suit suit) {
    }

    public enum CallType { PASS, BID, TRUMP, COINCHE }

    /** One call of the current deal's auction, in the order the calls were made. */
    public record AuctionCall(String playerName, String call) {
    }

    public record PlayerCall(String playerName, String call, boolean active) {
    }
}
