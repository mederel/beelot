package com.beelot.game;

import java.time.Instant;
import java.util.UUID;

public record PrivateTableSeat(UUID playerId, String name, boolean ready, ConnectionState connectionState,
                               Instant disconnectedAt) {
}
