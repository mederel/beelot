package com.beelot.application.privategame;

import com.beelot.game.PrivateTable;
import com.beelot.game.PrivateTableConflictException;
import com.beelot.game.GameVariant;
import com.beelot.game.BiddingState;
import com.beelot.game.GameBoard;
import com.beelot.game.GameCard;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PrivateTableService {

    private static final char[] INVITATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final SecureRandom random = new SecureRandom();
    private final Duration reconnectTimeout;
    private final Map<UUID, PrivateTable> tables = new ConcurrentHashMap<>();
    private final Map<String, UUID> tableIdsByInvitationCode = new ConcurrentHashMap<>();
    private final Map<UUID, PlayerSession> sessions = new ConcurrentHashMap<>();
    private final Map<UUID, BiddingState> biddingStates = new ConcurrentHashMap<>();
    private final Map<UUID, GameBoard> boards = new ConcurrentHashMap<>();

    public PrivateTableService() {
        this(Duration.ofMinutes(2));
    }

    @Autowired
    public PrivateTableService(@Value("${beelot.private-table.reconnect-timeout:PT2M}") Duration reconnectTimeout) {
        this.reconnectTimeout = reconnectTimeout;
    }

    public PrivateTableAccess create(String ownerName) {
        return create(ownerName, GameVariant.CLASSIC);
    }

    public PrivateTableAccess create(String ownerName, GameVariant variant) {
        if (variant == null) variant = GameVariant.CLASSIC;
        UUID tableId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        PrivateTable table = new PrivateTable(tableId, nextInvitationCode(), ownerId, requiredName(ownerName), variant);
        tables.put(tableId, table);
        tableIdsByInvitationCode.put(table.invitationCode(), tableId);
        return newSession(table, ownerId);
    }

    public PrivateTableAccess join(String invitationCode, String playerName) {
        UUID tableId = tableIdsByInvitationCode.get(normalizedInvitationCode(invitationCode));
        if (tableId == null) {
            throw new PrivateTableConflictException("The invitation code is invalid.");
        }
        PrivateTable table = getTable(tableId);
        UUID playerId = UUID.randomUUID();
        table.join(playerId, requiredName(playerName));
        return newSession(table, playerId);
    }

    public PrivateTable ready(UUID tableId, UUID token, boolean ready) {
        PrivateTable table = tableForSession(tableId, token);
        table.setReady(sessions.get(token).playerId(), ready);
        return table;
    }

    public PrivateTable start(UUID tableId, UUID token) {
        PrivateTable table = tableForSession(tableId, token);
        table.start(sessions.get(token).playerId());
        biddingStates.put(tableId, new BiddingState(table.seats().stream()
                .map(seat -> new GameBoard.GamePlayer(seat.playerId(), seat.name())).toList(), table.variant()));
        return table;
    }

    public BiddingState.BiddingView bidding(UUID tableId, UUID token) {
        return biddingState(tableId, token).viewFor(playerId(token));
    }

    public BiddingState.BiddingView pass(UUID tableId, UUID token) {
        BiddingState bidding = biddingState(tableId, token);
        bidding.pass(playerId(token));
        storeCompletedBoard(tableId, bidding);
        return bidding.viewFor(playerId(token));
    }

    public BiddingState.BiddingView bid(UUID tableId, UUID token, int value, GameCard.Suit suit) {
        BiddingState bidding = biddingState(tableId, token);
        bidding.bid(playerId(token), value, suit);
        storeCompletedBoard(tableId, bidding);
        return bidding.viewFor(playerId(token));
    }

    public BiddingState.BiddingView coinche(UUID tableId, UUID token) {
        BiddingState bidding = biddingState(tableId, token);
        bidding.coinche(playerId(token));
        storeCompletedBoard(tableId, bidding);
        return bidding.viewFor(playerId(token));
    }

    public GameBoard chooseTrump(UUID tableId, UUID token, GameCard.Suit suit) {
        BiddingState bidding = biddingState(tableId, token);
        GameBoard board = bidding.chooseTrump(playerId(token), suit);
        boards.put(tableId, board);
        return board;
    }

    public GameBoard.GameBoardView board(UUID tableId, UUID token) {
        tableForSession(tableId, token);
        GameBoard board = boards.get(tableId);
        if (board == null) throw new PrivateTableConflictException("The auction has not finished.");
        return board.viewFor(playerId(token));
    }

    public GameBoard.GameBoardView play(UUID tableId, UUID token, GameCard card) {
        GameBoard board = boardState(tableId, token);
        board.play(playerId(token), card);
        return board.viewFor(playerId(token));
    }

    public GameBoard.GameBoardView continueAfterTrick(UUID tableId, UUID token) {
        GameBoard board = boardState(tableId, token);
        board.continueAfterTrick();
        return board.viewFor(playerId(token));
    }

    public PrivateTable setTurnTimer(UUID tableId, UUID token, int seconds) {
        PrivateTable table = tableForSession(tableId, token);
        table.setTurnTimer(sessions.get(token).playerId(), seconds);
        return table;
    }

    public PrivateTable get(UUID tableId) {
        PrivateTable table = getTable(tableId);
        table.replaceExpiredDisconnections(Instant.now(), reconnectTimeout);
        return table;
    }

    public PrivateTable disconnect(UUID tableId, UUID token) {
        PrivateTable table = tableForSession(tableId, token);
        table.disconnect(sessions.get(token).playerId(), Instant.now());
        return table;
    }

    public PrivateTableAccess reconnect(UUID tableId, UUID token) {
        PrivateTable table = tableForSession(tableId, token);
        table.replaceExpiredDisconnections(Instant.now(), reconnectTimeout);
        PlayerSession session = sessions.get(token);
        table.reconnect(session.playerId());
        return new PrivateTableAccess(table, session.playerId(), token);
    }

    private PrivateTableAccess newSession(PrivateTable table, UUID playerId) {
        UUID token = UUID.randomUUID();
        sessions.put(token, new PlayerSession(table.id(), playerId));
        return new PrivateTableAccess(table, playerId, token);
    }

    private PrivateTable tableForSession(UUID tableId, UUID token) {
        PlayerSession session = sessions.get(token);
        if (session == null || !session.tableId().equals(tableId)) {
            throw new PrivateTableConflictException("You are not authorized for this table.");
        }
        return getTable(tableId);
    }

    private UUID playerId(UUID token) {
        PlayerSession session = sessions.get(token);
        if (session == null) throw new PrivateTableConflictException("You are not authorized for this table.");
        return session.playerId();
    }

    private BiddingState biddingState(UUID tableId, UUID token) {
        tableForSession(tableId, token);
        BiddingState bidding = biddingStates.get(tableId);
        if (bidding == null) throw new PrivateTableConflictException("This game has not started.");
        return bidding;
    }

    private GameBoard boardState(UUID tableId, UUID token) {
        tableForSession(tableId, token);
        GameBoard board = boards.get(tableId);
        if (board == null) throw new PrivateTableConflictException("The auction has not finished.");
        return board;
    }

    private void storeCompletedBoard(UUID tableId, BiddingState bidding) {
        if (bidding.completedBoard() != null) boards.put(tableId, bidding.completedBoard());
    }

    private PrivateTable getTable(UUID tableId) {
        PrivateTable table = tables.get(tableId);
        if (table == null) {
            throw new PrivateTableConflictException("This table does not exist.");
        }
        return table;
    }

    private String nextInvitationCode() {
        String code;
        do {
            StringBuilder candidate = new StringBuilder(6);
            for (int index = 0; index < 6; index++) {
                candidate.append(INVITATION_ALPHABET[random.nextInt(INVITATION_ALPHABET.length)]);
            }
            code = candidate.toString();
        } while (tableIdsByInvitationCode.containsKey(code));
        return code;
    }

    private String requiredName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new PrivateTableConflictException("Enter a player name.");
        }
        return name.trim();
    }

    private String normalizedInvitationCode(String invitationCode) {
        return invitationCode == null ? "" : invitationCode.trim().toUpperCase();
    }

    private record PlayerSession(UUID tableId, UUID playerId) {
    }

    public record PrivateTableAccess(PrivateTable table, UUID playerId, UUID token) {
    }
}
