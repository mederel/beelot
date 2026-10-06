package fr.beelot.application.bot;

import fr.beelot.application.history.FinishedMatch;
import fr.beelot.game.BotDifficulty;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameSeat;
import fr.beelot.game.GameVariant;
import fr.beelot.game.PrivateTableConflictException;
import fr.beelot.game.bot.BotStrategies;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

class PassAndPlayServiceTest {

    private final List<FinishedMatch> recorded = new ArrayList<>();
    private final BotGameService service = new BotGameService(10, Duration.ofHours(1),
            BotStrategies::forDifficulty, recorded::add);

    @Test
    void humansTakeTheSeatsTheyChoseAndBotsTheOthers() {
        var game = service.createPassAndPlay(BotDifficulty.RELAXED, GameVariant.CONTREE,
                Arrays.asList("Ana", null, " Ben ", ""));

        assertTrue(game.passAndPlay());
        assertEquals(List.of("Ana", "Camille", "Ben", "Luc"), game.seats().stream().map(GameSeat::name).toList());
        assertEquals(List.of(GameSeat.SeatType.HUMAN, GameSeat.SeatType.BOT, GameSeat.SeatType.HUMAN,
                GameSeat.SeatType.BOT), game.seats().stream().map(GameSeat::type).toList());
    }

    @Test
    void botsAreNotNamedLikeAPlayer() {
        var game = service.createPassAndPlay(BotDifficulty.RELAXED, GameVariant.CLASSIC,
                Arrays.asList("Camille", "Luc", null, null));

        assertEquals(List.of("Camille", "Luc", "Manon", "Hugo"), game.seats().stream().map(GameSeat::name).toList());
    }

    @Test
    void needsTwoToFourPlayersWithDifferentShortEnoughNames() {
        assertEquals("Pass and play needs at least two players.", assertThrows(PrivateTableConflictException.class,
                () -> service.createPassAndPlay(BotDifficulty.RELAXED, GameVariant.CLASSIC,
                        Arrays.asList("Ana", null, null, " "))).getMessage());
        assertEquals("Each player needs a different name.", assertThrows(PrivateTableConflictException.class,
                () -> service.createPassAndPlay(BotDifficulty.RELAXED, GameVariant.CLASSIC,
                        Arrays.asList("Ana", "ana", null, null))).getMessage());
        assertEquals("Player names are limited to 30 characters.", assertThrows(PrivateTableConflictException.class,
                () -> service.createPassAndPlay(BotDifficulty.RELAXED, GameVariant.CLASSIC,
                        Arrays.asList("Ana", "B".repeat(31), null, null))).getMessage());
        assertThrows(PrivateTableConflictException.class, () -> service.createPassAndPlay(BotDifficulty.RELAXED,
                GameVariant.CLASSIC, List.of("Ana", "Ben")));
    }

    /**
     * Four humans play a whole Contrée match. The device always shows the hand of the human whose turn it is, and a
     * completed trick stays with the human who played its last card. The match is not recorded.
     */
    @Test
    void theDeviceShowsTheHandOfTheHumanWhoseTurnItIs() {
        var game = service.createPassAndPlay(BotDifficulty.RELAXED, GameVariant.CONTREE,
                List.of("Ana", "Ben", "Chloé", "David"));
        UUID id = game.id();

        for (int round = 1; !service.matchStatus(id).complete(); round++) {
            if (round > 20) fail("The match did not end after 20 rounds.");
            if (round > 1) service.nextRound(id);
            var bidding = service.bidding(id);
            for (int guard = 0; !bidding.complete(); guard++) {
                if (guard > 20) fail("The auction did not complete.");
                assertTrue(bidding.playerTurn(), "the viewer is the player to speak");
                assertEquals(game.seats().get(service.viewerIndex(id)).name(), bidding.activePlayer());
                bidding = bidding.highestBid() < 160 && bidding.highestBid() == 0
                        ? service.bid(id, 80, GameCard.Suit.HEARTS) : service.pass(id);
            }
            int lastPlayer = -1;
            var board = service.boardView(id);
            for (int guard = 0; board.roundResult() == null; guard++) {
                if (guard > 40) fail("The round did not finish.");
                if (board.reviewingCompletedTrick()) {
                    assertEquals(lastPlayer, board.currentPlayerIndex(), "the trick stays with its last player");
                    service.continueAfterTrick(id);
                } else {
                    assertEquals(board.activePlayerIndex(), board.currentPlayerIndex(), "the viewer plays next");
                    lastPlayer = board.currentPlayerIndex();
                    service.play(id, board.legalCards().getFirst());
                }
                board = service.boardView(id);
            }
        }

        assertTrue(recorded.isEmpty(), "pass-and-play matches are not recorded");
    }

    /** Ana and Chloé play against two bots in classic Belote; a bot's turn never shows its hand. */
    @Test
    void botsPlayTheirTurnsBetweenTheHumans() {
        var game = service.createPassAndPlay(BotDifficulty.CHALLENGING, GameVariant.CLASSIC,
                Arrays.asList("Ana", null, "Chloé", null));
        UUID id = game.id();

        var bidding = service.bidding(id);
        for (int guard = 0; !bidding.complete(); guard++) {
            if (guard > 20) fail("The auction did not complete.");
            int viewer = service.viewerIndex(id);
            assertEquals(GameSeat.SeatType.HUMAN, game.seats().get(viewer).type());
            if (bidding.round() == 1) {
                service.chooseTrump(id, bidding.upturnedCard().suit());
                break;
            }
            bidding = service.pass(id);
        }
        var board = service.boardView(id);
        for (int guard = 0; board.roundResult() == null; guard++) {
            if (guard > 40) fail("The round did not finish.");
            assertEquals(GameSeat.SeatType.HUMAN, game.seats().get(board.currentPlayerIndex()).type());
            if (board.reviewingCompletedTrick()) service.continueAfterTrick(id);
            else service.play(id, board.legalCards().getFirst());
            board = service.boardView(id);
        }
        assertFalse(board.roundResult() == null);
    }
}
