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
    private final GameCard.Suit trump;
    private final String declaringTeam;

    private GameBoard(List<GamePlayer> players, Map<UUID, List<GameCard>> hands, GameCard.Suit trump, String declaringTeam) {
        this.players = List.copyOf(players);
        this.hands = Map.copyOf(hands);
        this.trump = trump;
        this.declaringTeam = declaringTeam;
    }

    public static GameBoard fromBidding(List<GamePlayer> players, Map<UUID, List<GameCard>> hands,
                                        GameCard.Suit trump, int declaringPlayerIndex) {
        if (players.size() != 4) {
            throw new IllegalArgumentException("A Belote table needs four players.");
        }
        for (GamePlayer player : players) {
            if (hands.getOrDefault(player.playerId(), List.of()).size() != 8) {
                throw new IllegalArgumentException("Every player must have eight cards.");
            }
        }
        return new GameBoard(players, hands, trump,
                declaringPlayerIndex % 2 == 0 ? "North–South" : "East–West");
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
        return new GameBoardView(hand, seats, trump.displayName(), declaringTeam, players.getFirst().name(), List.of(), 0, 0, 0);
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
