package fr.beelot.game;

import java.util.List;
import java.util.UUID;

/**
 * A solo or pass-and-play game; {@code announcements} says whether players may declare them (US-060), and
 * {@code target} how many points win the match (US-062).
 */
public record BotGame(UUID id, BotDifficulty difficulty, GameVariant variant, List<GameSeat> seats,
                      boolean announcements, int target) {

    public BotGame {
        seats = List.copyOf(seats);
        MatchScore.requireTarget(target);
        if (seats.size() != 4) {
            throw new IllegalArgumentException("A bot game must have four seats.");
        }
    }

    /** Whether several humans share the device (US-019). */
    public boolean passAndPlay() {
        return seats.stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN).count() > 1;
    }
}
