package fr.beelot.game;

import fr.beelot.game.bot.BotTurns;
import fr.beelot.game.bot.RuleBasedStrategy;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameBoardLastTrickTest {

    private final List<GameBoard.GamePlayer> players = List.of(
            new GameBoard.GamePlayer(UUID.randomUUID(), "Ana"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "Ben"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "Chloe"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "David"));

    @Test
    void playsTheLastTrickAutomaticallyOnceEachPlayerHasOneCardLeft() {
        GameBoard board = GameBoard.fromBidding(players, deal(), GameCard.Suit.HEARTS, 0);
        UUID observer = players.getFirst().playerId();
        while (board.viewFor(observer).completedTricks() < 7) {
            if (board.viewFor(observer).reviewingCompletedTrick()) board.continueAfterTrick();
            else BotTurns.playTurn(board, new RuleBasedStrategy());
        }
        assertNull(board.viewFor(observer).roundResult());

        board.continueAfterTrick();

        GameBoard.GameBoardView view = board.viewFor(observer);
        assertEquals(8, view.completedTricks());
        assertTrue(view.reviewingCompletedTrick());
        assertEquals(4, view.currentTrick().size());
        assertTrue(view.hand().isEmpty());
        assertNotNull(view.roundResult());
        assertEquals(162, view.roundResult().northSouthCardPoints() + view.roundResult().eastWestCardPoints()
                + view.roundResult().northSouthDixDeDer() + view.roundResult().eastWestDixDeDer());
    }

    private Map<UUID, List<GameCard>> deal() {
        List<GameCard> deck = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : List.of("7", "8", "9", "10", "J", "Q", "K", "A")) deck.add(new GameCard(rank, suit));
        }
        Map<UUID, List<GameCard>> hands = new HashMap<>();
        for (int index = 0; index < players.size(); index++) {
            hands.put(players.get(index).playerId(), deck.subList(index * 8, index * 8 + 8));
        }
        return hands;
    }
}
