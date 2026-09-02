package com.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GameBoardBeloteTest {

    @Test
    void declaresBeloteThenAwardsRebeloteBonusOnce() {
        UUID firstPlayer = UUID.randomUUID();
        List<GameBoard.GamePlayer> players = List.of(
                new GameBoard.GamePlayer(firstPlayer, "Ana"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Ben"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Chloe"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "David")
        );
        GameCard kingOfHearts = new GameCard("K", GameCard.Suit.HEARTS);
        GameCard queenOfHearts = new GameCard("Q", GameCard.Suit.HEARTS);
        Map<UUID, List<GameCard>> hands = Map.of(
                players.get(0).playerId(), hand(kingOfHearts, queenOfHearts),
                players.get(1).playerId(), hand(new GameCard("7", GameCard.Suit.HEARTS)),
                players.get(2).playerId(), hand(new GameCard("8", GameCard.Suit.HEARTS)),
                players.get(3).playerId(), hand(new GameCard("7", GameCard.Suit.HEARTS))
        );
        GameBoard board = GameBoard.fromBidding(players, hands, GameCard.Suit.HEARTS, 0);

        board.play(players.get(0).playerId(), kingOfHearts);
        assertEquals("Ana declares Belote.", board.viewFor(firstPlayer).declarationMessage());
        board.playAutomatedTurn();
        board.playAutomatedTurn();
        board.playAutomatedTurn();
        board.continueAfterTrick();
        board.play(firstPlayer, queenOfHearts);

        assertEquals(20, board.viewFor(firstPlayer).beloteBonusPoints());
        assertEquals("Ana declares Rebelote: 20 bonus points.", board.viewFor(firstPlayer).declarationMessage());
    }

    private static List<GameCard> hand(GameCard first, GameCard... rest) {
        return List.of(first, rest.length > 0 ? rest[0] : new GameCard("7", GameCard.Suit.CLUBS),
                new GameCard("8", GameCard.Suit.CLUBS), new GameCard("9", GameCard.Suit.CLUBS),
                new GameCard("10", GameCard.Suit.CLUBS), new GameCard("J", GameCard.Suit.CLUBS),
                new GameCard("Q", GameCard.Suit.CLUBS), new GameCard("A", GameCard.Suit.CLUBS));
    }
}
