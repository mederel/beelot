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
    private final List<PlayedCard> currentTrick = new ArrayList<>();
    private List<PlayedCard> completedTrick = List.of();
    private int activePlayerIndex;
    private int completedTricks;
    private int nextLeaderIndex;
    private int northSouthScore;
    private int eastWestScore;
    private boolean reviewingCompletedTrick;

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
        return new GameBoardView(hand, legalCards(playerId), seats, trump.displayName(), declaringTeam,
                players.get(activePlayerIndex).name(), visibleTrick.stream().map(PlayedCard::card).toList(),
                completedTricks, northSouthScore, eastWestScore, reviewingCompletedTrick,
                reviewingCompletedTrick ? players.get(nextLeaderIndex).name() : "", trickPoints(visibleTrick));
    }

    public synchronized void play(UUID playerId, GameCard card) {
        if (!players.get(activePlayerIndex).playerId().equals(playerId)) {
            throw new PrivateTableConflictException("It is not your turn to play.");
        }
        if (!legalCards(playerId).contains(card)) {
            throw new PrivateTableConflictException("That card is not a legal play.");
        }
        hands.get(playerId).remove(card);
        currentTrick.add(new PlayedCard(playerId, card));
        activePlayerIndex = (activePlayerIndex + 1) % players.size();
        if (currentTrick.size() == 4) resolveTrick();
    }

    public synchronized void playAutomatedTurn() {
        UUID playerId = players.get(activePlayerIndex).playerId();
        play(playerId, legalCards(playerId).getFirst());
    }

    public synchronized void continueAfterTrick() {
        if (!reviewingCompletedTrick) throw new PrivateTableConflictException("There is no completed trick to continue from.");
        currentTrick.clear();
        reviewingCompletedTrick = false;
        activePlayerIndex = nextLeaderIndex;
    }

    private List<GameCard> legalCards(UUID playerId) {
        if (reviewingCompletedTrick) return List.of();
        List<GameCard> hand = hands.get(playerId);
        if (hand == null || !players.get(activePlayerIndex).playerId().equals(playerId)) return List.of();
        if (currentTrick.isEmpty()) return List.copyOf(hand);
        GameCard.Suit lead = currentTrick.getFirst().card().suit();
        List<GameCard> leadCards = hand.stream().filter(card -> card.suit() == lead).toList();
        if (!leadCards.isEmpty()) return mustOvertrump(leadCards, lead) ? higherTrumps(leadCards) : leadCards;
        int winnerIndex = playerIndex(winningCard().playerId());
        if (winnerIndex % 2 == activePlayerIndex % 2) return List.copyOf(hand);
        List<GameCard> trumps = hand.stream().filter(card -> card.suit() == trump).toList();
        if (trumps.isEmpty()) return List.copyOf(hand);
        List<GameCard> higher = higherTrumps(trumps);
        return higher.isEmpty() ? trumps : higher;
    }

    private boolean mustOvertrump(List<GameCard> leadCards, GameCard.Suit lead) {
        return lead == trump && currentTrick.stream().anyMatch(played -> played.card().suit() == trump)
                && !higherTrumps(leadCards).isEmpty();
    }

    private List<GameCard> higherTrumps(List<GameCard> trumps) {
        PlayedCard winner = winningCard();
        if (winner.card().suit() != trump) return trumps;
        return trumps.stream().filter(card -> cardStrength(card) > cardStrength(winner.card())).toList();
    }

    private PlayedCard winningCard() {
        GameCard.Suit lead = currentTrick.getFirst().card().suit();
        return currentTrick.stream().reduce((winner, contender) -> wins(contender.card(), winner.card(), lead) ? contender : winner).orElseThrow();
    }

    private boolean wins(GameCard contender, GameCard winner, GameCard.Suit lead) {
        if (contender.suit() == winner.suit()) return cardStrength(contender) > cardStrength(winner);
        return contender.suit() == trump || (winner.suit() != trump && contender.suit() == lead);
    }

    private int cardStrength(GameCard card) {
        List<String> ranks = card.suit() == trump
                ? List.of("7", "8", "Q", "K", "10", "A", "9", "J")
                : List.of("7", "8", "9", "J", "Q", "K", "10", "A");
        return ranks.indexOf(card.rank());
    }

    private int playerIndex(UUID playerId) {
        for (int index = 0; index < players.size(); index++) if (players.get(index).playerId().equals(playerId)) return index;
        throw new IllegalArgumentException("Unknown player");
    }

    private void resolveTrick() {
        PlayedCard winner = winningCard();
        int points = trickPoints(currentTrick);
        nextLeaderIndex = playerIndex(winner.playerId());
        if (nextLeaderIndex % 2 == 0) northSouthScore += points;
        else eastWestScore += points;
        completedTrick = List.copyOf(currentTrick);
        completedTricks++;
        reviewingCompletedTrick = true;
    }

    private int trickPoints(List<PlayedCard> trick) {
        return trick.stream().mapToInt(played -> cardPoints(played.card())).sum();
    }

    private int cardPoints(GameCard card) {
        return switch (card.rank()) {
            case "A" -> 11;
            case "10" -> 10;
            case "K" -> 4;
            case "Q" -> 3;
            case "J" -> card.suit() == trump ? 20 : 2;
            case "9" -> card.suit() == trump ? 14 : 0;
            default -> 0;
        };
    }

    public record GamePlayer(UUID playerId, String name) {
    }

    public record GameBoardView(List<GameCard> hand, List<GameCard> legalCards, List<GameBoardSeat> seats, String trump,
                                String declaringTeam, String activePlayer, List<GameCard> currentTrick,
                                int completedTricks, int northSouthScore, int eastWestScore,
                                boolean reviewingCompletedTrick, String trickWinner, int trickPoints) {
    }

    public record GameBoardSeat(String name, int cardCount, boolean active, String team) {
    }

    private record PlayedCard(UUID playerId, GameCard card) {
    }
}
