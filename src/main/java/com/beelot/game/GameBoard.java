package com.beelot.game;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class GameBoard {

    private final List<GamePlayer> players;
    private final Map<UUID, List<GameCard>> hands;

    private GameBoard(List<GamePlayer> players, Map<UUID, List<GameCard>> hands) {
        this.players = List.copyOf(players);
        this.hands = Map.copyOf(hands);
    }

    public static GameBoard start(List<GamePlayer> players) {
        if (players.size() != 4) {
            throw new IllegalArgumentException("A Belote table needs four players.");
        }
        List<GameCard> deck = deck();
        Collections.shuffle(deck, new SecureRandom());
        Map<UUID, List<GameCard>> hands = new HashMap<>();
        for (int index = 0; index < players.size(); index++) {
            hands.put(players.get(index).playerId(), List.copyOf(deck.subList(index * 8, index * 8 + 8)));
        }
        return new GameBoard(players, hands);
    }

    public GameBoardView viewFor(UUID playerId) {
        List<GameCard> hand = hands.get(playerId);
        if (hand == null) {
            throw new PrivateTableConflictException("You are not seated at this table.");
        }
        List<GameBoardSeat> seats = new ArrayList<>();
        for (int index = 0; index < players.size(); index++) {
            GamePlayer player = players.get(index);
            seats.add(new GameBoardSeat(player.name(), hands.get(player.playerId()).size(), index == 0,
                    index % 2 == 0 ? "North–South" : "East–West"));
        }
        return new GameBoardView(hand, seats, "Hearts", "North–South", players.getFirst().name(), List.of(), 0, 0, 0);
    }

    private static List<GameCard> deck() {
        List<GameCard> deck = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) {
                deck.add(new GameCard(rank, suit));
            }
        }
        return deck;
    }

    public record GamePlayer(UUID playerId, String name) {
    }

    public record GameBoardView(List<GameCard> hand, List<GameBoardSeat> seats, String trump,
                                String declaringTeam, String activePlayer, List<GameCard> currentTrick,
                                int completedTricks, int northSouthScore, int eastWestScore) {
    }

    public record GameBoardSeat(String name, int cardCount, boolean active, String team) {
    }
}
