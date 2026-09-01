package com.beelot.game;

import java.util.UUID;

public record PrivateTableSeat(UUID playerId, String name, boolean ready) {
}
