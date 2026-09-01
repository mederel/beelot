package com.beelot.game;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

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
        this.seats = new ArrayList<>(List.of(new PrivateTableSeat(ownerPlayerId, ownerName, false)));
        this.status = PrivateTableStatus.WAITING_FOR_PLAYERS;
    }

    public synchronized void join(UUID playerId, String name) {
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        if (seats.size() == 4) {
            throw new PrivateTableConflictException("This table is full.");
        }
        seats.add(new PrivateTableSeat(playerId, name, false));
    }

    public synchronized void setReady(UUID playerId, boolean ready) {
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        int index = seatIndex(playerId);
        PrivateTableSeat seat = seats.get(index);
        seats.set(index, new PrivateTableSeat(seat.playerId(), seat.name(), ready));
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
