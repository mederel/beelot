package fr.beelot.application.privacy;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * A player's data as they download it (US-082), in version 1 of the export format. Times are ISO-8601 instants in
 * UTC. Other players appear by the names shown in the match history; no account id but the player's own, no token
 * and no provider user id is ever part of it.
 */
public record DataExport(String format, String exportedAt, Account account, List<Event> securityEvents,
                         List<Match> matches) {

    public static final String FORMAT = "beelot-export-1";

    public record Account(String id, String displayName, String createdAt, String lastSignInAt,
                          String previousSignInAt, SignIn signIn) {
    }

    /**
     * How the player signs in; the address only for email-link players, and the address they are moving to while a
     * change is waiting for its link to be opened (US-079).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SignIn(String method, String email, String pendingEmail) {
    }

    public record Event(String type, String outcome, String ipAddress, String occurredAt) {
    }

    public record Match(String endedAt, String mode, String variant, String difficulty, String yourTeam,
                        int northSouthScore, int eastWestScore, boolean won, List<Seat> seats, List<Round> rounds) {
    }

    public record Seat(int position, String name, String team, boolean bot) {
    }

    public record Round(String declaringTeam, String trump, Integer contractValue, boolean coinched,
                        boolean contractMade, String capotTeam, String beloteTeam, int northSouthPoints,
                        int eastWestPoints) {
    }
}
