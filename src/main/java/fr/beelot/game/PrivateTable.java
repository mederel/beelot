package fr.beelot.game;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;
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
    /** The four seats in table order, an empty seat being null; seats 0 and 2 play North–South. */
    private final PrivateTableSeat[] seats = new PrivateTableSeat[4];
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
        this.seats[0] = new PrivateTableSeat(ownerPlayerId, ownerName, false, ConnectionState.CONNECTED, null);
        this.status = PrivateTableStatus.WAITING_FOR_PLAYERS;
    }

    /** Opens a matchmaking table: no invitation code, and bots take the empty seats once {@code botFillAt} passes. */
    public static PrivateTable openPublic(UUID id, UUID ownerPlayerId, String ownerName, GameVariant variant, Instant botFillAt) {
        return new PrivateTable(id, null, ownerPlayerId, ownerName, variant, true, botFillAt);
    }

    public synchronized void join(UUID playerId, String name) {
        // Everyone left: the table is being removed, so nobody may sit down at it any more.
        if (isEmpty()) throw new PrivateTableConflictException("This table does not exist.");
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        if (seatedCount() == 4) {
            throw new PrivateTableConflictException("This table is full.");
        }
        seats[firstEmptySeat()] = new PrivateTableSeat(playerId, name, false, ConnectionState.CONNECTED, null);
        if (publicTable && seatedCount() == 4) {
            markEveryoneReady();
            status = PrivateTableStatus.IN_PROGRESS;
        }
    }

    public synchronized void leave(UUID playerId) {
        int index = seatIndex(playerId);
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        seats[index] = null;
        if (ownerPlayerId.equals(playerId) && !isEmpty()) ownerPlayerId = seats().getFirst().playerId();
    }

    /** Moves a waiting player to an empty seat, so that players pick their partners before a private game starts. */
    public synchronized void chooseSeat(UUID playerId, int position) {
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        if (publicTable) throw new PrivateTableConflictException("Seats are assigned at public tables.");
        int index = seatIndex(playerId);
        if (position < 0 || position >= seats.length) throw new PrivateTableConflictException("That seat does not exist.");
        if (position == index) return;
        if (seats[position] != null) throw new PrivateTableConflictException("That seat is taken.");
        seats[position] = seats[index];
        seats[index] = null;
    }

    public synchronized boolean isEmpty() {
        return seatedCount() == 0;
    }

    /** The seat a player sits in, from 0 to 3 in table order. */
    public synchronized int positionOf(UUID playerId) {
        return seatIndex(playerId);
    }

    /** Starts a waiting public table with bots in the empty seats once its deadline has passed; true when it started. */
    public synchronized boolean fillWithBotsIfDue(Instant now) {
        if (!publicTable || isEmpty() || status != PrivateTableStatus.WAITING_FOR_PLAYERS || botFillAt.isAfter(now)) return false;
        markEveryoneReady();
        seatBotsAndStart();
        return true;
    }

    public synchronized void setReady(UUID playerId, boolean ready) {
        if (status != PrivateTableStatus.WAITING_FOR_PLAYERS) {
            throw new PrivateTableConflictException("This table has already started.");
        }
        int index = seatIndex(playerId);
        PrivateTableSeat seat = seats[index];
        seats[index] = new PrivateTableSeat(seat.playerId(), seat.name(), ready, seat.connectionState(), seat.disconnectedAt());
    }

    public synchronized void disconnect(UUID playerId, Instant disconnectedAt) {
        int index = seatIndex(playerId);
        PrivateTableSeat seat = seats[index];
        if (seat.connectionState() == ConnectionState.BOT_TAKEOVER) return;
        seats[index] = new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.DISCONNECTED, disconnectedAt);
    }

    public synchronized void reconnect(UUID playerId) {
        int index = seatIndex(playerId);
        PrivateTableSeat seat = seats[index];
        if (seat.connectionState() == ConnectionState.BOT_TAKEOVER) {
            throw new PrivateTableConflictException("A bot has taken over this seat for the rest of the match.");
        }
        seats[index] = new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.CONNECTED, null);
    }

    public synchronized void replaceExpiredDisconnections(Instant now, Duration timeout) {
        for (int index = 0; index < seats.length; index++) {
            PrivateTableSeat seat = seats[index];
            if (seat != null && seat.connectionState() == ConnectionState.DISCONNECTED
                    && !seat.disconnectedAt().plus(timeout).isAfter(now)) {
                seats[index] = new PrivateTableSeat(seat.playerId(), seat.name(), seat.ready(), ConnectionState.BOT_TAKEOVER, seat.disconnectedAt());
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
        if (seatedCount() != 4 || seats().stream().anyMatch(seat -> !seat.ready())) {
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
        if (seats().stream().anyMatch(seat -> !seat.ready())) {
            throw new PrivateTableConflictException("Every seated player must be ready to start with bots.");
        }
        seatBotsAndStart();
    }

    /** Bots sit in the seats the players left empty. */
    private void seatBotsAndStart() {
        int bots = 0;
        for (int index = 0; index < seats.length; index++) {
            if (seats[index] == null) {
                seats[index] = new PrivateTableSeat(UUID.randomUUID(), BOT_NAMES.get(bots++), true, ConnectionState.BOT_TAKEOVER, null);
            }
        }
        status = PrivateTableStatus.IN_PROGRESS;
    }

    private void markEveryoneReady() {
        for (int index = 0; index < seats.length; index++) {
            PrivateTableSeat seat = seats[index];
            if (seat != null) seats[index] = new PrivateTableSeat(seat.playerId(), seat.name(), true, seat.connectionState(), seat.disconnectedAt());
        }
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

    /** The occupied seats in table order; once the game has started, all four seats are occupied. */
    public synchronized List<PrivateTableSeat> seats() {
        return Arrays.stream(seats).filter(Objects::nonNull).toList();
    }

    public synchronized PrivateTableStatus status() {
        return status;
    }

    public synchronized int turnTimerSeconds() {
        return turnTimerSeconds;
    }

    private int seatIndex(UUID playerId) {
        for (int index = 0; index < seats.length; index++) {
            if (seats[index] != null && seats[index].playerId().equals(playerId)) {
                return index;
            }
        }
        throw new PrivateTableConflictException("You are not seated at this table.");
    }

    private int seatedCount() {
        return (int) Arrays.stream(seats).filter(Objects::nonNull).count();
    }

    private int firstEmptySeat() {
        for (int index = 0; index < seats.length; index++) if (seats[index] == null) return index;
        throw new PrivateTableConflictException("This table is full.");
    }
}
