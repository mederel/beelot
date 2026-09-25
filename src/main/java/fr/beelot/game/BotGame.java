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
}
