package com.beelot.game;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class BiddingState {

    private final List<GameBoard.GamePlayer> players;
    private final SecureRandom random = new SecureRandom();
    private Map<UUID, List<GameCard>> hands;
    private List<GameCard> remainingDeck;
    private GameCard upturnedCard;
    private int activePlayerIndex;
    private int round = 1;
    private int consecutivePasses;
    private String message;

    public BiddingState(List<GameBoard.GamePlayer> players) {
        if (players.size() != 4) {
            throw new IllegalArgumentException("A Belote table needs four players.");
        }
        this.players = List.copyOf(players);
        dealAgain("Five cards have been dealt. Accept the upturned suit or pass.");
    }

    public synchronized void pass(UUID playerId) {
        requireActivePlayer(playerId);
        consecutivePasses++;
        activePlayerIndex = (activePlayerIndex + 1) % players.size();
        if (consecutivePasses != players.size()) {
            message = players.get(activePlayerIndex).name() + " is deciding.";
            return;
        }
        if (round == 1) {
            round = 2;
            consecutivePasses = 0;
            activePlayerIndex = 0;
            message = "Everyone passed. Choose any trump suit except " + upturnedCard.suit().name() + ".";
            return;
        }
        dealAgain("Everyone passed twice. The cards have been redealt.");
    }

    public synchronized GameBoard chooseTrump(UUID playerId, GameCard.Suit trump) {
        requireActivePlayer(playerId);
        if (round == 1 && trump != upturnedCard.suit()) {
            throw new PrivateTableConflictException("In the first round, you may only accept the upturned suit.");
        }
        if (round == 2 && trump == upturnedCard.suit()) {
            throw new PrivateTableConflictException("Choose a suit other than the upturned suit.");
        }
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
        return GameBoard.fromBidding(players, completeHands, trump, activePlayerIndex);
    }

    public synchronized BiddingView viewFor(UUID playerId) {
        return new BiddingView(List.copyOf(hands.get(playerId)), upturnedCard, round,
                players.get(activePlayerIndex).name(), players.get(activePlayerIndex).playerId().equals(playerId), message);
    }

    public synchronized UUID activePlayerId() {
        return players.get(activePlayerIndex).playerId();
    }

    private void dealAgain(String dealMessage) {
        List<GameCard> deck = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) {
                deck.add(new GameCard(rank, suit));
            }
        }
        Collections.shuffle(deck, random);
        hands = new HashMap<>();
        for (GameBoard.GamePlayer player : players) {
            List<GameCard> hand = new ArrayList<>();
            for (int card = 0; card < 5; card++) {
                hand.add(deck.removeFirst());
            }
            hands.put(player.playerId(), hand);
        }
        upturnedCard = deck.removeFirst();
        remainingDeck = deck;
        activePlayerIndex = 0;
        round = 1;
        consecutivePasses = 0;
        message = dealMessage;
    }

    private void requireActivePlayer(UUID playerId) {
        if (!activePlayerId().equals(playerId)) {
            throw new PrivateTableConflictException("It is not your turn to bid.");
        }
    }

    public record BiddingView(List<GameCard> hand, GameCard upturnedCard, int round, String activePlayer,
                              boolean playerTurn, String message) {
    }
}
