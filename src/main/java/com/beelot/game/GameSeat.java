package com.beelot.game;

public record GameSeat(String name, SeatType type) {

    public enum SeatType {
        HUMAN,
        AI
    }
}
