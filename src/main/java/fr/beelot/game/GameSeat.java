package fr.beelot.game;

import java.util.UUID;

public record GameSeat(UUID playerId, String name, SeatType type) {

    public enum SeatType {
        HUMAN,
        BOT
    }
}
