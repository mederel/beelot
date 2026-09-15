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
    private final GameVariant variant;
    private final int contractValue;
    private final boolean coinched;
    private final List<PlayedCard> currentTrick = new ArrayList<>();
    private List<PlayedCard> completedTrick = List.of();
    private int activePlayerIndex;
    private int completedTricks;
    private int nextLeaderIndex;
    private int northSouthScore;
    private int eastWestScore;
    private int northSouthCardPoints;
    private int eastWestCardPoints;
    private int northSouthDixDeDer;
    private int eastWestDixDeDer;
    private boolean reviewingCompletedTrick;
    private final UUID belotePlayerId;
    private int beloteCardsPlayed;
    private boolean beloteBonusAwarded;
    private String declarationMessage = "";
    private RoundResult roundResult;

    private GameBoard(List<GamePlayer> players, Map<UUID, List<GameCard>> hands, GameCard.Suit trump, String declaringTeam,
                      GameVariant variant, int contractValue, boolean coinched) {
        this.players = List.copyOf(players);
        Map<UUID, List<GameCard>> copiedHands = new HashMap<>();
        hands.forEach((playerId, hand) -> copiedHands.put(playerId, new ArrayList<>(hand)));
        this.hands = copiedHands;
        this.trump = trump;
        this.declaringTeam = declaringTeam;
        this.variant = variant;
        this.contractValue = contractValue;
        this.coinched = coinched;
        this.belotePlayerId = players.stream()
                .filter(player -> hasBelote(hands.get(player.playerId()), trump))
                .map(GamePlayer::playerId)
                .findFirst()
                .orElse(null);
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
                declaringPlayerIndex % 2 == 0 ? "North–South" : "East–West", GameVariant.CLASSIC, 82, false);
    }

    public static GameBoard fromContract(List<GamePlayer> players, Map<UUID, List<GameCard>> hands,
                                         GameCard.Suit trump, int declaringPlayerIndex, int contractValue,
                                         boolean coinched) {
        if (contractValue < 80 || contractValue > 160 || contractValue % 10 != 0) {
            throw new IllegalArgumentException("Invalid Contrée contract.");
        }
        if (players.size() != 4 || players.stream()
                .anyMatch(player -> hands.getOrDefault(player.playerId(), List.of()).size() != 8)) {
            throw new IllegalArgumentException("A Contrée table needs four hands of eight cards.");
        }
        return new GameBoard(players, hands, trump,
                declaringPlayerIndex % 2 == 0 ? "North–South" : "East–West", GameVariant.CONTREE, contractValue, coinched);
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
                players.get(playerIndex(playerId)).name(), playerIndex(playerId), activePlayerIndex);
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

    public synchronized void playAutomatedTurn() {
        UUID playerId = players.get(activePlayerIndex).playerId();
        play(playerId, legalCards(playerId).getFirst());
    }

    public synchronized UUID activePlayerId() {
        return players.get(activePlayerIndex).playerId();
    }

    public synchronized void continueAfterTrick() {
        if (roundResult != null) throw new PrivateTableConflictException("This round has ended.");
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
        boolean lastTrick = completedTricks == 7;
        if (lastTrick) points += 10;
        nextLeaderIndex = playerIndex(winner.playerId());
        if (nextLeaderIndex % 2 == 0) {
            northSouthScore += points;
            northSouthCardPoints += points - (lastTrick ? 10 : 0);
            if (lastTrick) northSouthDixDeDer = 10;
        } else {
            eastWestScore += points;
            eastWestCardPoints += points - (lastTrick ? 10 : 0);
            if (lastTrick) eastWestDixDeDer = 10;
        }
        completedTrick = List.copyOf(currentTrick);
        completedTricks++;
        reviewingCompletedTrick = true;
        if (completedTricks == 8) calculateRoundResult();
    }

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
        if (coinched) {
            northSouthAwarded *= 2;
            eastWestAwarded *= 2;
        }
        roundResult = new RoundResult(northSouthCardPoints, eastWestCardPoints, northSouthDixDeDer, eastWestDixDeDer,
                northSouthBelote, eastWestBelote, contractMade, northSouthAwarded, eastWestAwarded);
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
                                boolean reviewingCompletedTrick, String trickWinner, int trickPoints,
                                String declarationMessage, int beloteBonusPoints, RoundResult roundResult,
                                GameVariant variant, int contractValue, boolean coinched, String currentPlayer,
                                int currentPlayerIndex, int activePlayerIndex) {
    }

    public record RoundResult(int northSouthCardPoints, int eastWestCardPoints, int northSouthDixDeDer,
                              int eastWestDixDeDer, int northSouthBeloteBonus, int eastWestBeloteBonus,
                              boolean contractMade, int northSouthAwarded, int eastWestAwarded) {
    }

    public record GameBoardSeat(String name, int cardCount, boolean active, String team) {
    }

    private record PlayedCard(UUID playerId, GameCard card) {
    }
}
