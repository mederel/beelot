package fr.beelot.application.privacy;

import java.util.List;

/**
 * A player's data as they download it (US-082), in version 2 of the export format. Times are ISO-8601 instants in
 * UTC. Other players appear by the names shown in the match history; no account id but the player's own is ever part
 * of it, and of the passkey only its dates: never its public key or credential id.
 */
public record DataExport(String format, String exportedAt, Account account, List<Event> securityEvents,
                         List<Match> matches) {

    public static final String FORMAT = "beelot-export-2";

    public record Account(String id, String displayName, String createdAt, String lastSignInAt,
                          String previousSignInAt, Passkey passkey) {
    }

    public record Passkey(String createdAt, String lastUsedAt) {
    }

    public record Event(String type, String outcome, String ipAddress, String occurredAt) {
    }

    public record Match(String endedAt, String mode, String variant, String difficulty, boolean announcements,
                        int target, String yourTeam,
                        int northSouthScore, int eastWestScore, boolean won, List<Seat> seats, List<Round> rounds) {
    }

    public record Seat(int position, String name, String team, boolean bot) {
    }

    public record Round(String declaringTeam, String trump, Integer contractValue, boolean coinched,
                        boolean contractMade, String capotTeam, String beloteTeam, int northSouthPoints,
                        int eastWestPoints, int northSouthAnnouncements, int eastWestAnnouncements) {
    }
}
