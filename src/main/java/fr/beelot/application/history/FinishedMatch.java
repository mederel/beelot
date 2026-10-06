package fr.beelot.application.history;

import fr.beelot.game.BotDifficulty;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameVariant;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A match that a team won, as the game services hand it over for the history (US-058). Teams are named as in the
 * game: "North–South" and "East–West"; seats are listed in play order, North first.
 */
public record FinishedMatch(UUID id, Instant endedAt, Mode mode, GameVariant variant, BotDifficulty difficulty,
                            int northSouthScore, int eastWestScore, String winningTeam, List<Seat> seats,
                            List<GameBoard.RoundSummary> rounds) {

    public FinishedMatch {
        seats = List.copyOf(seats);
        rounds = List.copyOf(rounds);
    }

    public enum Mode { SOLO, PRIVATE, PUBLIC }

    /** A seat, with the account of the signed-in player who took it (null for a guest or a bot). */
    public record Seat(UUID accountId, String name, boolean bot) {
    }

    public boolean hasSignedInPlayer() {
        return seats.stream().anyMatch(seat -> seat.accountId() != null);
    }

    static String team(int position) {
        return position % 2 == 0 ? "North–South" : "East–West";
    }
}
