package com.beelot.application.privategame;

import com.beelot.game.PrivateTable;
import com.beelot.game.PrivateTableConflictException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PrivateTableService {

    private static final char[] INVITATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final SecureRandom random = new SecureRandom();
    private final Map<UUID, PrivateTable> tables = new ConcurrentHashMap<>();
    private final Map<String, UUID> tableIdsByInvitationCode = new ConcurrentHashMap<>();
    private final Map<UUID, PlayerSession> sessions = new ConcurrentHashMap<>();

    public PrivateTableAccess create(String ownerName) {
        UUID tableId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        PrivateTable table = new PrivateTable(tableId, nextInvitationCode(), ownerId, requiredName(ownerName));
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
        return table;
    }

    public PrivateTable get(UUID tableId) {
        return getTable(tableId);
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
