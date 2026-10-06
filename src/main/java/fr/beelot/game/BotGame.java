package fr.beelot.game;

import java.util.List;
import java.util.UUID;

public record BotGame(UUID id, BotDifficulty difficulty, GameVariant variant, List<GameSeat> seats) {

    public BotGame {
        seats = List.copyOf(seats);
        if (seats.size() != 4) {
            throw new IllegalArgumentException("A bot game must have four seats.");
        }
    }

    /** Whether several humans share the device (US-019). */
    public boolean passAndPlay() {
        return seats.stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN).count() > 1;
    }
}
