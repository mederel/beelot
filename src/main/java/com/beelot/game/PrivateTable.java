package com.beelot.game;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.time.Duration;
import java.time.Instant;

public final class PrivateTable {

    private final UUID id;
    private final String invitationCode;
    private final UUID ownerPlayerId;
    private final List<PrivateTableSeat> seats;
    private PrivateTableStatus status;

    public PrivateTable(UUID id, String invitationCode, UUID ownerPlayerId, String ownerName) {
        this.id = id;
        this.invitationCode = invitationCode;
        this.ownerPlayerId = ownerPlayerId;
        this.seats = new ArrayList<>(List.of(new PrivateTableSeat(ownerPlayerId, ownerName, false, ConnectionState.CONNECTED, null)));
        this.status = PrivateTableStatus.WAITING_FOR_PLAYERS;
    }

    public synchronized void join(UUID playerId, String name) {
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        if (seats.size() == 4) {
            throw new PrivateTableConflictException("This table is full.");
        }
        seats.add(new PrivateTableSeat(playerId, name, false, ConnectionState.CONNECTED, null));
    }

    public synchronized void setReady(UUID playerId, boolean ready) {
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        int index = seatIndex(playerId);
        PrivateTableSeat seat = seats.get(index);
        seats.set(index, new PrivateTableSeat(seat.playerId(), seat.name(), ready, seat.connectionState(), seat.disconnectedAt()));
    }

    public synchronized void disconnect(UUID playerId, Instant disconnectedAt) {
        int index = seatIndex(playerId);
        PrivateTableSeat seat = seats.get(index);
        if (seat.connectionState() == ConnectionState.AI_TAKEOVER) return;
        seats.set(index, new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.DISCONNECTED, disconnectedAt));
    }

    public synchronized void reconnect(UUID playerId) {
        int index = seatIndex(playerId);
        PrivateTableSeat seat = seats.get(index);
        if (seat.connectionState() == ConnectionState.AI_TAKEOVER) {
            throw new PrivateTableConflictException("An AI has taken over this seat for the rest of the match.");
        }
        seats.set(index, new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.CONNECTED, null));
    }

    public synchronized void replaceExpiredDisconnections(Instant now, Duration timeout) {
        for (int index = 0; index < seats.size(); index++) {
            PrivateTableSeat seat = seats.get(index);
            if (seat.connectionState() == ConnectionState.DISCONNECTED && !seat.disconnectedAt().plus(timeout).isAfter(now)) {
                seats.set(index, new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.AI_TAKEOVER, seat.disconnectedAt()));
            }
        }
    }

    public synchronized void start(UUID playerId) {
        if (!ownerPlayerId.equals(playerId)) {
            throw new PrivateTableConflictException("Only the table owner can start the game.");
        }
        if (seats.size() != 4 || seats.stream().anyMatch(seat -> !seat.ready())) {
            throw new PrivateTableConflictException("Four ready players are required to start the game.");
        }
        status = PrivateTableStatus.IN_PROGRESS;
    }

    public UUID id() {
        return id;
    }

    public String invitationCode() {
        return invitationCode;
    }

    public UUID ownerPlayerId() {
        return ownerPlayerId;
    }

    public synchronized List<PrivateTableSeat> seats() {
        return List.copyOf(seats);
    }

    public synchronized PrivateTableStatus status() {
        return status;
    }

    private int seatIndex(UUID playerId) {
        for (int index = 0; index < seats.size(); index++) {
            if (seats.get(index).playerId().equals(playerId)) {
                return index;
            }
        }
        throw new PrivateTableConflictException("You are not seated at this table.");
    }
}
