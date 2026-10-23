package fr.beelot.game.bot;

import fr.beelot.game.BeloteRules;
import fr.beelot.game.BotDifficulty;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.Trump;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BotsPlayNewContractsTest {

    static Stream<Arguments> cases() {
        List<Arguments> cases = new ArrayList<>();
        for (Trump trump : List.of(Trump.ALL_TRUMPS, Trump.NO_TRUMPS)) {
            for (BotDifficulty difficulty : BotDifficulty.values()) {
                cases.add(Arguments.of(trump, difficulty, false));
                cases.add(Arguments.of(trump, difficulty, true));
            }
        }
        return cases.stream();
    }

    @ParameterizedTest
    @MethodSource("cases")
    void everyChosenCardIsLegalAndTheRoundTotals162(Trump trump, BotDifficulty difficulty, boolean humanAtSeatZero) {
        BotStrategy strategy = BotStrategies.forDifficulty(difficulty);
        for (long seed = 1; seed <= 3; seed++) {
            List<GameBoard.GamePlayer> players = List.of(
                    new GameBoard.GamePlayer(UUID.randomUUID(), "N"), new GameBoard.GamePlayer(UUID.randomUUID(), "E"),
                    new GameBoard.GamePlayer(UUID.randomUUID(), "S"), new GameBoard.GamePlayer(UUID.randomUUID(), "W"));
            GameBoard board = GameBoard.fromContract(players, deal(players, seed), trump, 0, 80, false);
            UUID observer = players.getFirst().playerId();
            while (board.viewFor(observer).roundResult() == null) {
                if (board.viewFor(observer).reviewingCompletedTrick()) {
                    board.continueAfterTrick();
                    continue;
                }
                UUID active = board.activePlayerId();
                GameBoard.PlayView view = board.playViewFor(active);
                assertEquals(trump, view.trump());
                GameCard card;
                if (humanAtSeatZero && view.seat() == 0) {
                    List<GameCard> trick = view.currentTrick().stream().map(GameBoard.SeatCard::card).toList();
                    card = BeloteRules.legalCards(view.hand(), trick, trump).getFirst();
                } else {
                    card = strategy.chooseCard(view);
                }
                assertNotNull(card);
                assertTrue(view.legalCards().contains(card), trump + " " + difficulty + " chose " + card);
                board.play(active, card);
            }
            GameBoard.RoundResult result = board.viewFor(observer).roundResult();
            assertEquals(162, result.northSouthCardPoints() + result.eastWestCardPoints()
                    + result.northSouthDixDeDer() + result.eastWestDixDeDer(), trump + " seed " + seed);
        }
    }

    private static Map<UUID, List<GameCard>> deal(List<GameBoard.GamePlayer> players, long seed) {
        List<GameCard> deck = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) deck.add(new GameCard(rank, suit));
        }
        Collections.shuffle(deck, new Random(seed));
        Map<UUID, List<GameCard>> hands = new HashMap<>();
        for (int seat = 0; seat < 4; seat++) {
            hands.put(players.get(seat).playerId(), new ArrayList<>(deck.subList(seat * 8, seat * 8 + 8)));
        }
        return hands;
    }
}
