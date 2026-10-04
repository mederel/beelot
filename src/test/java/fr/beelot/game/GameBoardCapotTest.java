package fr.beelot.game;

import fr.beelot.game.bot.BotTurns;
import fr.beelot.game.bot.RuleBasedStrategy;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameBoardCapotTest {

    private final List<GameBoard.GamePlayer> players = List.of(
            new GameBoard.GamePlayer(UUID.randomUUID(), "North"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "East"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "South"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "West"));

    @Test
    void declaringTeamTakingEveryTrickScoresTheCapot() {
        GameBoard.RoundResult result = play(GameBoard.fromBidding(players, northSouthCapotDeal(), GameCard.Suit.HEARTS, 0, 3));

        assertEquals("North–South", result.capotTeam());
        assertTrue(result.contractMade());
        assertEquals(250, result.northSouthAwarded());
        // East declared Belote/Rebelote, which its team keeps.
        assertEquals(20, result.eastWestBeloteBonus());
        assertEquals(20, result.eastWestAwarded());
    }

    @Test
    void defendersTakingEveryTrickScoreTheCapot() {
        GameBoard.RoundResult result = play(GameBoard.fromBidding(players, northSouthCapotDeal(), GameCard.Suit.HEARTS, 1, 3));

        assertEquals("North–South", result.capotTeam());
        assertFalse(result.contractMade());
        assertEquals(250, result.northSouthAwarded());
        assertEquals(20, result.eastWestAwarded());
    }

    @Test
    void contreeCapotAlsoScoresTheBid() {
        GameBoard.RoundResult result = play(GameBoard.fromContract(players, northSouthCapotDeal(), GameCard.Suit.HEARTS, 0, 100, false, 3));

        assertEquals(350, result.northSouthAwarded());
        assertEquals(20, result.eastWestAwarded());
    }

    @Test
    void coincheDoublesTheCapotScore() {
        GameBoard.RoundResult result = play(GameBoard.fromContract(players, northSouthCapotDeal(), GameCard.Suit.HEARTS, 0, 100, true, 3));

        assertEquals(700, result.northSouthAwarded());
        assertEquals(40, result.eastWestAwarded());
    }

    @Test
    void contreeDefendersCapotDoesNotScoreTheDeclarersBid() {
        GameBoard.RoundResult result = play(GameBoard.fromContract(players, northSouthCapotDeal(), GameCard.Suit.HEARTS, 1, 100, false, 3));

        assertFalse(result.contractMade());
        assertEquals(250, result.northSouthAwarded());
    }

    @Test
    void aRoundWithoutCapotHasNoCapotTeam() {
        GameBoard.RoundResult result = play(GameBoard.fromBidding(players, sharedTricksDeal(), GameCard.Suit.HEARTS, 0, 3));

        assertEquals("", result.capotTeam());
        assertEquals(162, result.northSouthCardPoints() + result.eastWestCardPoints()
                + result.northSouthDixDeDer() + result.eastWestDixDeDer());
    }

    private GameBoard.RoundResult play(GameBoard board) {
        UUID observer = players.getFirst().playerId();
        while (board.viewFor(observer).roundResult() == null) {
            if (board.viewFor(observer).reviewingCompletedTrick()) board.continueAfterTrick();
            else BotTurns.playTurn(board, new RuleBasedStrategy());
        }
        return board.viewFor(observer).roundResult();
    }

    /** North leads and holds six trumps and two aces; East holds the king and queen of trump. */
    private Map<UUID, List<GameCard>> northSouthCapotDeal() {
        return Map.of(
                players.get(0).playerId(), cards("J♥ 9♥ A♥ 10♥ 8♥ 7♥ A♠ A♣"),
                players.get(1).playerId(), cards("K♥ Q♥ K♠ Q♠ J♠ K♣ Q♣ J♣"),
                players.get(2).playerId(), cards("10♠ 9♠ 10♣ 9♣ A♦ 10♦ K♦ Q♦"),
                players.get(3).playerId(), cards("8♠ 7♠ 8♣ 7♣ J♦ 9♦ 8♦ 7♦"));
    }

    /** Each team holds its own aces, so both teams take tricks. */
    private Map<UUID, List<GameCard>> sharedTricksDeal() {
        return Map.of(
                players.get(0).playerId(), cards("J♥ 9♥ 7♠ 8♠ 9♠ 7♣ 8♣ 9♣"),
                players.get(1).playerId(), cards("A♠ 10♠ K♠ A♣ 10♣ K♣ 7♥ 8♥"),
                players.get(2).playerId(), cards("A♥ 10♥ Q♠ J♠ Q♣ J♣ 7♦ 8♦"),
                players.get(3).playerId(), cards("K♥ Q♥ A♦ 10♦ K♦ Q♦ J♦ 9♦"));
    }

    private static List<GameCard> cards(String text) {
        return java.util.Arrays.stream(text.split(" ")).map(card -> {
            String rank = card.substring(0, card.length() - 1);
            GameCard.Suit suit = switch (card.charAt(card.length() - 1)) {
                case '♥' -> GameCard.Suit.HEARTS;
                case '♠' -> GameCard.Suit.SPADES;
                case '♣' -> GameCard.Suit.CLUBS;
                default -> GameCard.Suit.DIAMONDS;
            };
            return new GameCard(rank, suit);
        }).toList();
    }
}
