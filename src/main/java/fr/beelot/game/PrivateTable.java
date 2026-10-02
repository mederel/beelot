package fr.beelot.game;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.time.Duration;
import java.time.Instant;

public final class PrivateTable {

    private static final List<String> BOT_NAMES = List.of("Camille", "Luc", "Manon");

    private final UUID id;
    private final String invitationCode;
    private UUID ownerPlayerId;
    private final GameVariant variant;
    private final boolean publicTable;
    private final Instant botFillAt;
    private final List<PrivateTableSeat> seats;
    private PrivateTableStatus status;
    private int turnTimerSeconds;

    public PrivateTable(UUID id, String invitationCode, UUID ownerPlayerId, String ownerName) {
        this(id, invitationCode, ownerPlayerId, ownerName, GameVariant.CLASSIC);
    }

    public PrivateTable(UUID id, String invitationCode, UUID ownerPlayerId, String ownerName, GameVariant variant) {
        this(id, invitationCode, ownerPlayerId, ownerName, variant, false, null);
    }

    private PrivateTable(UUID id, String invitationCode, UUID ownerPlayerId, String ownerName, GameVariant variant,
                         boolean publicTable, Instant botFillAt) {
        this.id = id;
        this.publicTable = publicTable;
        this.botFillAt = botFillAt;
        this.invitationCode = invitationCode;
        this.ownerPlayerId = ownerPlayerId;
        this.variant = variant;
        this.seats = new ArrayList<>(List.of(new PrivateTableSeat(ownerPlayerId, ownerName, false, ConnectionState.CONNECTED, null)));
        this.status = PrivateTableStatus.WAITING_FOR_PLAYERS;
    }

    /** Opens a matchmaking table: no invitation code, and bots take the empty seats once {@code botFillAt} passes. */
    public static PrivateTable openPublic(UUID id, UUID ownerPlayerId, String ownerName, GameVariant variant, Instant botFillAt) {
        return new PrivateTable(id, null, ownerPlayerId, ownerName, variant, true, botFillAt);
    }

    public synchronized void join(UUID playerId, String name) {
        // Everyone left: the table is being removed, so nobody may sit down at it any more.
        if (seats.isEmpty()) throw new PrivateTableConflictException("This table does not exist.");
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        if (seats.size() == 4) {
            throw new PrivateTableConflictException("This table is full.");
        }
        seats.add(new PrivateTableSeat(playerId, name, false, ConnectionState.CONNECTED, null));
        if (publicTable && seats.size() == 4) {
            markEveryoneReady();
            status = PrivateTableStatus.IN_PROGRESS;
        }
    }

    public synchronized void leave(UUID playerId) {
        int index = seatIndex(playerId);
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        seats.remove(index);
        if (ownerPlayerId.equals(playerId) && !seats.isEmpty()) ownerPlayerId = seats.get(0).playerId();
    }

    public synchronized boolean isEmpty() {
        return seats.isEmpty();
    }

    /** Starts a waiting public table with bots in the empty seats once its deadline has passed; true when it started. */
    public synchronized boolean fillWithBotsIfDue(Instant now) {
        if (!publicTable || seats.isEmpty() || status != PrivateTableStatus.WAITING_FOR_PLAYERS || botFillAt.isAfter(now)) return false;
        markEveryoneReady();
        seatBotsAndStart();
        return true;
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
        if (seat.connectionState() == ConnectionState.BOT_TAKEOVER) return;
        seats.set(index, new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.DISCONNECTED, disconnectedAt));
    }

    public synchronized void reconnect(UUID playerId) {
        int index = seatIndex(playerId);
        PrivateTableSeat seat = seats.get(index);
        if (seat.connectionState() == ConnectionState.BOT_TAKEOVER) {
            throw new PrivateTableConflictException("A bot has taken over this seat for the rest of the match.");
        }
        seats.set(index, new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.CONNECTED, null));
    }

    public synchronized void replaceExpiredDisconnections(Instant now, Duration timeout) {
        for (int index = 0; index < seats.size(); index++) {
            PrivateTableSeat seat = seats.get(index);
            if (seat.connectionState() == ConnectionState.DISCONNECTED && !seat.disconnectedAt().plus(timeout).isAfter(now)) {
                seats.set(index, new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.BOT_TAKEOVER, seat.disconnectedAt()));
            }
        }
    }

    public synchronized void start(UUID playerId) {
        if (!ownerPlayerId.equals(playerId)) {
            throw new PrivateTableConflictException("Only the table owner can start the game.");
        }
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        if (seats.size() != 4 || seats.stream().anyMatch(seat -> !seat.ready())) {
            throw new PrivateTableConflictException("Four ready players are required to start the game.");
        }
        status = PrivateTableStatus.IN_PROGRESS;
    }

    public synchronized void startWithBots(UUID playerId) {
        if (!ownerPlayerId.equals(playerId)) {
            throw new PrivateTableConflictException("Only the table owner can start the game.");
        }
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        if (seats.stream().anyMatch(seat -> !seat.ready())) {
            throw new PrivateTableConflictException("Every seated player must be ready to start with bots.");
        }
        seatBotsAndStart();
    }

    private void seatBotsAndStart() {
        int botsNeeded = 4 - seats.size();
        for (int index = 0; index < botsNeeded; index++) {
            seats.add(new PrivateTableSeat(UUID.randomUUID(), BOT_NAMES.get(index), true, ConnectionState.BOT_TAKEOVER, null));
        }
        status = PrivateTableStatus.IN_PROGRESS;
    }

    private void markEveryoneReady() {
        seats.replaceAll(seat -> new PrivateTableSeat(seat.playerId(), seat.name(), true, seat.connectionState(), seat.disconnectedAt()));
    }

    public synchronized void setTurnTimer(UUID playerId, int seconds) {
        if (!ownerPlayerId.equals(playerId)) throw new PrivateTableConflictException("Only the table owner can change the turn timer.");
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) throw new PrivateTableConflictException("The turn timer cannot change after the game starts.");
        if (seconds != 0 && seconds != 30 && seconds != 60) throw new PrivateTableConflictException("Choose no timer, 30 seconds, or 60 seconds.");
        turnTimerSeconds = seconds;
    }

    public UUID id() {
        return id;
    }

    public String invitationCode() {
        return invitationCode;
    }

    public synchronized UUID ownerPlayerId() {
        return ownerPlayerId;
    }

    public GameVariant variant() { return variant; }

    public boolean publicTable() { return publicTable; }

    public Instant botFillAt() { return botFillAt; }

    public synchronized List<PrivateTableSeat> seats() {
        return List.copyOf(seats);
    }

    public synchronized PrivateTableStatus status() {
        return status;
    }

    public synchronized int turnTimerSeconds() {
        return turnTimerSeconds;
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
