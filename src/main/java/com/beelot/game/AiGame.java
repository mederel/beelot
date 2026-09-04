package com.beelot.game;

import java.util.List;
import java.util.UUID;

public record AiGame(UUID id, AiDifficulty difficulty, GameVariant variant, List<GameSeat> seats) {

    public AiGame {
        seats = List.copyOf(seats);
        if (seats.size() != 4) {
            throw new IllegalArgumentException("An AI game must have four seats.");
        }
    }
}
