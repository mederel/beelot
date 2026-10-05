package fr.beelot.game;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class GameBoard {

    private final List<GamePlayer> players;
    private final Map<UUID, List<GameCard>> hands;
    private final GameCard.Suit trump;
    private final int declaringPlayerIndex;
    private final String declaringTeam;
    private final GameVariant variant;
    private final int contractValue;
    private final boolean coinched;
    private final List<PlayedCard> currentTrick = new ArrayList<>();
    private List<PlayedCard> completedTrick = List.of();
    private final List<List<PlayedCard>> tricks = new ArrayList<>();
    private final int dealerIndex;
    private int activePlayerIndex;
    private int completedTricks;
    private int nextLeaderIndex;
    private int northSouthScore;
    private int eastWestScore;
    private int northSouthCardPoints;
    private int eastWestCardPoints;
    private int northSouthDixDeDer;
    private int eastWestDixDeDer;
    private int northSouthTricks;
    private boolean reviewingCompletedTrick;
    private final UUID belotePlayerId;
    private int beloteCardsPlayed;
    private boolean beloteBonusAwarded;
    private String declarationMessage = "";
    private RoundResult roundResult;

    private GameBoard(List<GamePlayer> players, Map<UUID, List<GameCard>> hands, GameCard.Suit trump,
                      int declaringPlayerIndex, GameVariant variant, int contractValue, boolean coinched, int dealerIndex) {
        this.players = List.copyOf(players);
        Map<UUID, List<GameCard>> copiedHands = new HashMap<>();
        hands.forEach((playerId, hand) -> copiedHands.put(playerId, new ArrayList<>(hand)));
        this.hands = copiedHands;
        this.trump = trump;
        this.declaringPlayerIndex = declaringPlayerIndex;
        this.declaringTeam = declaringPlayerIndex % 2 == 0 ? "North–South" : "East–West";
        this.variant = variant;
        this.contractValue = contractValue;
        this.coinched = coinched;
        this.dealerIndex = dealerIndex;
        this.activePlayerIndex = (dealerIndex + 1) % players.size();
        this.belotePlayerId = players.stream()
                .filter(player -> hasBelote(hands.get(player.playerId()), trump))
                .map(GamePlayer::playerId)
                .findFirst()
                .orElse(null);
    }

    public static GameBoard fromBidding(List<GamePlayer> players, Map<UUID, List<GameCard>> hands,
                                        GameCard.Suit trump, int declaringPlayerIndex) {
        return fromBidding(players, hands, trump, declaringPlayerIndex, players.size() - 1);
    }

    /** The player to the dealer's left leads the first trick. */
    public static GameBoard fromBidding(List<GamePlayer> players, Map<UUID, List<GameCard>> hands,
                                        GameCard.Suit trump, int declaringPlayerIndex, int dealerIndex) {
        if (players.size() != 4) {
            throw new IllegalArgumentException("A Belote table needs four players.");
        }
        for (GamePlayer player : players) {
            if (hands.getOrDefault(player.playerId(), List.of()).size() != 8) {
                throw new IllegalArgumentException("Every player must have eight cards.");
            }
        }
        return new GameBoard(players, hands, trump, declaringPlayerIndex, GameVariant.CLASSIC, 82, false, dealerIndex);
    }

    public static GameBoard fromContract(List<GamePlayer> players, Map<UUID, List<GameCard>> hands,
                                         GameCard.Suit trump, int declaringPlayerIndex, int contractValue,
                                         boolean coinched) {
        return fromContract(players, hands, trump, declaringPlayerIndex, contractValue, coinched, players.size() - 1);
    }

    public static GameBoard fromContract(List<GamePlayer> players, Map<UUID, List<GameCard>> hands,
                                         GameCard.Suit trump, int declaringPlayerIndex, int contractValue,
                                         boolean coinched, int dealerIndex) {
        if (contractValue < 80 || contractValue > 160 || contractValue % 10 != 0) {
            throw new IllegalArgumentException("Invalid Contrée contract.");
        }
        if (players.size() != 4 || players.stream()
                .anyMatch(player -> hands.getOrDefault(player.playerId(), List.of()).size() != 8)) {
            throw new IllegalArgumentException("A Contrée table needs four hands of eight cards.");
        }
        return new GameBoard(players, hands, trump, declaringPlayerIndex, GameVariant.CONTREE, contractValue, coinched,
                dealerIndex);
    }

    public synchronized GameBoardView viewFor(UUID playerId) {
        List<GameCard> hand = hands.get(playerId);
        if (hand == null) {
            throw new PrivateTableConflictException("You are not seated at this table.");
        }
        List<GameBoardSeat> seats = new ArrayList<>();
        for (int index = 0; index < players.size(); index++) {
            GamePlayer player = players.get(index);
            seats.add(new GameBoardSeat(player.name(), hands.get(player.playerId()).size(), index == activePlayerIndex,
                    index % 2 == 0 ? "North–South" : "East–West"));
        }
        List<PlayedCard> visibleTrick = reviewingCompletedTrick ? completedTrick : currentTrick;
        List<GameCard> orderedHand = hand.stream().sorted(GameCard.displayOrder(trump)).toList();
        return new GameBoardView(orderedHand, legalCards(playerId), seats, trump.displayName(), declaringTeam,
                players.get(activePlayerIndex).name(), visibleTrick.stream().map(PlayedCard::card).toList(),
                completedTricks, northSouthScore, eastWestScore, reviewingCompletedTrick,
                reviewingCompletedTrick ? players.get(nextLeaderIndex).name() : "", trickPoints(visibleTrick),
                declarationMessage, beloteBonusAwarded ? 20 : 0, roundResult, variant, contractValue, coinched,
                players.get(playerIndex(playerId)).name(), playerIndex(playerId), activePlayerIndex, dealerIndex);
    }

    public synchronized void play(UUID playerId, GameCard card) {
        if (!players.get(activePlayerIndex).playerId().equals(playerId)) {
            throw new PrivateTableConflictException("It is not your turn to play.");
        }
        if (!legalCards(playerId).contains(card)) {
            throw new PrivateTableConflictException("That card is not a legal play.");
        }
        registerBeloteDeclaration(playerId, card);
        hands.get(playerId).remove(card);
        currentTrick.add(new PlayedCard(playerId, card));
        activePlayerIndex = (activePlayerIndex + 1) % players.size();
        if (currentTrick.size() == 4) resolveTrick();
    }

    /**
     * What the given player can see when choosing a card: their own hand in the order it was dealt, their legal
     * cards, the contract, and every card played so far with the seat that played it.
     */
    public synchronized PlayView playViewFor(UUID playerId) {
        int seat = playerIndex(playerId);
        List<SeatCard> trick = reviewingCompletedTrick ? List.of() : seatCards(currentTrick);
        return new PlayView(seat, List.copyOf(hands.get(playerId)), legalCards(playerId), trump, variant,
                contractValue, coinched, declaringPlayerIndex, tricks.stream().map(this::seatCards).toList(), trick);
    }

    private List<SeatCard> seatCards(List<PlayedCard> trick) {
        return trick.stream().map(played -> new SeatCard(playerIndex(played.playerId()), played.card())).toList();
    }

    public synchronized UUID activePlayerId() {
        return players.get(activePlayerIndex).playerId();
    }

    /** Once each player holds a single card, the last trick is played for them, starting with its leader. */
    public synchronized void continueAfterTrick() {
        if (roundResult != null) throw new PrivateTableConflictException("This round has ended.");
        if (!reviewingCompletedTrick) throw new PrivateTableConflictException("There is no completed trick to continue from.");
        currentTrick.clear();
        reviewingCompletedTrick = false;
        activePlayerIndex = nextLeaderIndex;
        if (completedTricks == 7) {
            while (!reviewingCompletedTrick) {
                UUID playerId = players.get(activePlayerIndex).playerId();
                play(playerId, hands.get(playerId).getFirst());
            }
        }
    }

    private List<GameCard> legalCards(UUID playerId) {
        if (reviewingCompletedTrick) return List.of();
        List<GameCard> hand = hands.get(playerId);
        if (hand == null || !players.get(activePlayerIndex).playerId().equals(playerId)) return List.of();
        return BeloteRules.legalCards(hand, currentTrick.stream().map(PlayedCard::card).toList(), trump);
    }

    private PlayedCard winningCard() {
        return currentTrick.get(BeloteRules.winningIndex(currentTrick.stream().map(PlayedCard::card).toList(), trump));
    }

    private int playerIndex(UUID playerId) {
        for (int index = 0; index < players.size(); index++) if (players.get(index).playerId().equals(playerId)) return index;
        throw new IllegalArgumentException("Unknown player");
    }

    private void resolveTrick() {
        PlayedCard winner = winningCard();
        int points = trickPoints(currentTrick);
        boolean lastTrick = completedTricks == 7;
        if (lastTrick) points += 10;
        nextLeaderIndex = playerIndex(winner.playerId());
        if (nextLeaderIndex % 2 == 0) {
            northSouthTricks++;
            northSouthScore += points;
            northSouthCardPoints += points - (lastTrick ? 10 : 0);
            if (lastTrick) northSouthDixDeDer = 10;
        } else {
            eastWestScore += points;
            eastWestCardPoints += points - (lastTrick ? 10 : 0);
            if (lastTrick) eastWestDixDeDer = 10;
        }
        completedTrick = List.copyOf(currentTrick);
        tricks.add(completedTrick);
        completedTricks++;
        reviewingCompletedTrick = true;
        if (completedTricks == 8) calculateRoundResult();
    }

    /**
     * A team that takes every trick makes a capot and scores 250 instead of 162; a Contrée declaring team making a
     * capot also scores its bid. Belote/Rebelote stays with the team that declared it.
     */
    private void calculateRoundResult() {
        boolean northSouthDeclares = declaringTeam.equals("North–South");
        int declarerPoints = northSouthDeclares ? northSouthCardPoints + northSouthDixDeDer : eastWestCardPoints + eastWestDixDeDer;
        boolean contractMade = declarerPoints >= contractValue;
        int northSouthBelote = beloteBonusAwarded && playerIndex(belotePlayerId) % 2 == 0 ? 20 : 0;
        int eastWestBelote = beloteBonusAwarded && playerIndex(belotePlayerId) % 2 != 0 ? 20 : 0;
        int northSouthAwarded = contractMade || !northSouthDeclares ? northSouthCardPoints + northSouthDixDeDer + northSouthBelote : northSouthBelote;
        int eastWestAwarded = contractMade || northSouthDeclares ? eastWestCardPoints + eastWestDixDeDer + eastWestBelote : eastWestBelote;
        if (!contractMade) {
            if (northSouthDeclares) eastWestAwarded = 162 + eastWestBelote;
            else northSouthAwarded = 162 + northSouthBelote;
        }
        String capotTeam = northSouthTricks == 8 ? "North–South" : northSouthTricks == 0 ? "East–West" : "";
        if (!capotTeam.isEmpty()) {
            int capotScore = 250 + (variant == GameVariant.CONTREE && capotTeam.equals(declaringTeam) ? contractValue : 0);
            if (capotTeam.equals("North–South")) northSouthAwarded = capotScore + northSouthBelote;
            else eastWestAwarded = capotScore + eastWestBelote;
        }
        if (coinched) {
            northSouthAwarded *= 2;
            eastWestAwarded *= 2;
        }
        roundResult = new RoundResult(northSouthCardPoints, eastWestCardPoints, northSouthDixDeDer, eastWestDixDeDer,
                northSouthBelote, eastWestBelote, contractMade, northSouthAwarded, eastWestAwarded, capotTeam);
    }

    private void registerBeloteDeclaration(UUID playerId, GameCard card) {
        if (!playerId.equals(belotePlayerId) || card.suit() != trump || !(card.rank().equals("K") || card.rank().equals("Q"))) {
            return;
        }
        beloteCardsPlayed++;
        if (beloteCardsPlayed == 1) {
            declarationMessage = players.get(playerIndex(playerId)).name() + " declares Belote.";
            return;
        }
        if (!beloteBonusAwarded) {
            if (playerIndex(playerId) % 2 == 0) northSouthScore += 20;
            else eastWestScore += 20;
            beloteBonusAwarded = true;
            declarationMessage = players.get(playerIndex(playerId)).name() + " declares Rebelote: 20 bonus points.";
        }
    }

    private static boolean hasBelote(List<GameCard> hand, GameCard.Suit trump) {
        return hand.stream().anyMatch(card -> card.suit() == trump && card.rank().equals("K"))
                && hand.stream().anyMatch(card -> card.suit() == trump && card.rank().equals("Q"));
    }

    private int trickPoints(List<PlayedCard> trick) {
        return trick.stream().mapToInt(played -> BeloteRules.points(played.card(), trump)).sum();
    }

    public record GamePlayer(UUID playerId, String name) {
    }

    public record GameBoardView(List<GameCard> hand, List<GameCard> legalCards, List<GameBoardSeat> seats, String trump,
                                String declaringTeam, String activePlayer, List<GameCard> currentTrick,
                                int completedTricks, int northSouthScore, int eastWestScore,
                                boolean reviewingCompletedTrick, String trickWinner, int trickPoints,
                                String declarationMessage, int beloteBonusPoints, RoundResult roundResult,
                                GameVariant variant, int contractValue, boolean coinched, String currentPlayer,
                                int currentPlayerIndex, int activePlayerIndex, int dealerIndex) {
    }

    public record RoundResult(int northSouthCardPoints, int eastWestCardPoints, int northSouthDixDeDer,
                              int eastWestDixDeDer, int northSouthBeloteBonus, int eastWestBeloteBonus,
                              boolean contractMade, int northSouthAwarded, int eastWestAwarded, String capotTeam) {
    }

    public record GameBoardSeat(String name, int cardCount, boolean active, String team) {
    }

    /**
     * A player's view of the card play, for bots: seats are numbered in play order from 0 (North–South hold the
     * even seats). The hand keeps the order it was dealt in; {@code tricks} are the completed tricks and
     * {@code currentTrick} the cards of the trick being played, each in play order.
     */
    public record PlayView(int seat, List<GameCard> hand, List<GameCard> legalCards, GameCard.Suit trump,
                           GameVariant variant, int contractValue, boolean coinched, int declaringSeat,
                           List<List<SeatCard>> tricks, List<SeatCard> currentTrick) {

        public boolean declaring() {
            return seat % 2 == declaringSeat % 2;
        }
    }

    /** A card played from the given seat. */
    public record SeatCard(int seat, GameCard card) {
    }

    private record PlayedCard(UUID playerId, GameCard card) {
    }
}
