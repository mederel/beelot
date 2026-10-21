package fr.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static fr.beelot.game.GameCard.Suit.CLUBS;
import static fr.beelot.game.GameCard.Suit.DIAMONDS;
import static fr.beelot.game.GameCard.Suit.HEARTS;
import static fr.beelot.game.GameCard.Suit.SPADES;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Declaring announcements on the first card and revealing them after the first trick (US-060). Hearts are trump. */
class GameBoardAnnouncementsTest {

    private final List<GameBoard.GamePlayer> players = List.of(
            new GameBoard.GamePlayer(UUID.randomUUID(), "North"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "East"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "South"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "West"));
    private final UUID north = players.get(0).playerId();
    private final UUID east = players.get(1).playerId();

    @Test
    void declaringOnTheFirstCardScoresAfterTheFirstTrick() {
        GameBoard board = board(true);

        board.play(north, card("8", CLUBS), true);
        finishFirstTrick(board, false);

        GameBoard.GameBoardView view = board.viewFor(east);
        assertEquals(view.trickPoints() + 20, view.northSouthScore() + view.eastWestScore());
        assertEquals(1, view.revealedAnnouncements().size());
        GameBoard.Declaration declaration = view.revealedAnnouncements().getFirst();
        assertEquals("North", declaration.player());
        assertEquals(Announcement.Kind.TIERCE, declaration.announcements().getFirst().kind());
        assertTrue(declaration.scored());
        assertEquals(20, playOut(board).northSouthAnnouncements());
    }

    @Test
    void notDeclaringLosesThePoints() {
        GameBoard board = board(true);

        board.play(north, card("8", CLUBS), false);
        finishFirstTrick(board, false);

        assertTrue(board.viewFor(east).revealedAnnouncements().isEmpty());
        assertEquals(0, playOut(board).northSouthAnnouncements());
    }

    @Test
    void declareIgnoredWhenOff() {
        GameBoard board = board(false);
        assertTrue(board.viewFor(north).ownAnnouncements().isEmpty());

        board.play(north, card("8", CLUBS), true);
        finishFirstTrick(board, true);

        assertFalse(board.viewFor(north).announcements());
        assertTrue(board.viewFor(north).revealedAnnouncements().isEmpty());
        assertEquals(0, playOut(board).northSouthAnnouncements());
    }

    @Test
    void declareIgnoredAfterTheFirstCard() {
        GameBoard board = board(true);

        board.play(north, card("8", CLUBS), false);
        finishFirstTrick(board, false);
        board.continueAfterTrick();
        UUID leader = board.activePlayerId();
        board.play(leader, board.viewFor(leader).legalCards().getFirst(), true);

        assertTrue(board.viewFor(east).declarers().isEmpty());
        GameBoard.RoundResult result = playOut(board);
        assertEquals(0, result.northSouthAnnouncements() + result.eastWestAnnouncements());
    }

    @Test
    void onlyTheBestTeamScores() {
        GameBoard board = board(true);

        board.play(north, card("8", CLUBS), true);
        board.play(east, card("7", CLUBS), true);
        finishFirstTrick(board, false);

        List<GameBoard.Declaration> revealed = board.viewFor(north).revealedAnnouncements();
        assertEquals(2, revealed.size());
        assertFalse(revealed.get(0).scored());
        assertTrue(revealed.get(1).scored());
        GameBoard.RoundResult result = playOut(board);
        assertEquals(0, result.northSouthAnnouncements());
        assertEquals(50, result.eastWestAnnouncements());
    }

    @Test
    void opponentsSeeOnlyNamesDuringTheFirstTrick() {
        GameBoard board = board(true);

        board.play(north, card("8", CLUBS), true);

        GameBoard.GameBoardView east = board.viewFor(this.east);
        assertEquals(List.of("North"), east.declarers());
        assertTrue(east.revealedAnnouncements().isEmpty());
        assertEquals(Announcement.Kind.CINQUANTE, east.ownAnnouncements().getFirst().kind());
    }

    @Test
    void ownAnnouncementsGoneAfterFirstCard() {
        GameBoard board = board(true);
        assertEquals(1, board.viewFor(north).ownAnnouncements().size());

        board.play(north, card("8", CLUBS), false);

        assertTrue(board.viewFor(north).ownAnnouncements().isEmpty());
        assertTrue(board.viewFor(north).ownAnnouncements().isEmpty());
    }

    @Test
    void nobodyDeclaresNoReveal() {
        GameBoard board = board(true);

        board.play(north, card("8", CLUBS), false);
        finishFirstTrick(board, false);

        GameBoard.GameBoardView view = board.viewFor(north);
        assertTrue(view.revealedAnnouncements().isEmpty());
        assertTrue(view.declarers().isEmpty());
        assertTrue(playOut(board).announcements().isEmpty());
    }

    /** North leads; North holds a tierce in clubs and East a cinquante in spades; nobody holds Belote. */
    private GameBoard board(boolean announcements) {
        Map<UUID, List<GameCard>> hands = Map.of(
                north, cards("8C 9C 10C 7D 8D 7S 8S 7H"),
                east, cards("JS QS KS AS 9D 7C 9H AH"),
                players.get(2).playerId(), cards("JC KC 10D QD AD 8H 10H KH"),
                players.get(3).playerId(), cards("QC AC JD KD 9S JH QH 10S"));
        return GameBoard.fromBidding(players, hands, HEARTS, 0, 3, announcements);
    }

    /** Plays the rest of the first trick, every other player declaring or not. */
    private static void finishFirstTrick(GameBoard board, boolean declare) {
        while (!board.viewFor(board.activePlayerId()).reviewingCompletedTrick()) {
            UUID player = board.activePlayerId();
            board.play(player, board.viewFor(player).legalCards().getFirst(), declare);
        }
    }

    private static GameBoard.RoundResult playOut(GameBoard board) {
        GameBoard.RoundResult result;
        while ((result = board.viewFor(board.activePlayerId()).roundResult()) == null) {
            UUID player = board.activePlayerId();
            GameBoard.GameBoardView view = board.viewFor(player);
            if (view.reviewingCompletedTrick()) board.continueAfterTrick();
            else board.play(player, view.legalCards().getFirst());
        }
        return result;
    }

    private static List<GameCard> cards(String codes) {
        return Arrays.stream(codes.split(" ")).map(code -> {
            String rank = code.substring(0, code.length() - 1);
            GameCard.Suit suit = switch (code.charAt(code.length() - 1)) {
                case 'C' -> CLUBS;
                case 'D' -> DIAMONDS;
                case 'H' -> HEARTS;
                default -> SPADES;
            };
            return new GameCard(rank, suit);
        }).toList();
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }
}
