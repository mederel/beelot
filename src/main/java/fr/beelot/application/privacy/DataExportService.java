package fr.beelot.application.privacy;

import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Builds the data a player downloads (US-082): their account, their security events and their matches, newest first.
 * A player may download it once an hour; each download is recorded as an {@code EXPORT} event, which sets the next.
 */
@Service
@RegisterReflectionForBinding(DataExport.class)
public class DataExportService {

    private static final Duration INTERVAL = Duration.ofHours(1);

    private final JdbcClient jdbc;
    private final SecurityEvents events;
    private final Clock clock;

    DataExportService(JdbcClient jdbc, SecurityEvents events, Clock clock) {
        this.jdbc = jdbc;
        this.events = events;
        this.clock = clock;
    }

    public sealed interface Result {
    }

    public record Ready(DataExport export) implements Result {
    }

    public record TooSoon(long minutesLeft) implements Result {
    }

    /** Not one read-only transaction: the {@code EXPORT} event it records must be written. */
    public Result export(UUID accountId, String ip) {
        String id = accountId.toString();
        Instant now = clock.instant();
        Optional<LocalDateTime> lastExport = jdbc.sql("SELECT MAX(occurred_at) FROM security_event "
                        + "WHERE account_id = ? AND type = 'EXPORT'")
                .param(id).query((row, number) -> row.getObject(1, LocalDateTime.class)).optional();
        if (lastExport.isPresent()) {
            Instant next = lastExport.get().toInstant(ZoneOffset.UTC).plus(INTERVAL);
            if (next.isAfter(now)) {
                long seconds = Duration.between(now, next).toSeconds();
                return new TooSoon((seconds + 59) / 60);
            }
        }
        DataExport export = new DataExport(DataExport.FORMAT, now.toString(), account(id), events(id), matches(id));
        events.record(Type.EXPORT, Outcome.SUCCESS, accountId, ip);
        return new Ready(export);
    }

    private DataExport.Account account(String id) {
        return jdbc.sql("SELECT a.id, a.display_name, a.created_at, a.last_sign_in_at, a.previous_sign_in_at "
                        + "FROM account a WHERE a.id = ?")
                .param(id)
                .query((row, number) -> new DataExport.Account(row.getString(1), row.getString(2), instant(row, 3),
                        instant(row, 4), instant(row, 5), passkey(id)))
                .single();
    }

    /** Spring Security writes these as {@link Timestamp}s, unlike Beelot's own UTC columns. */
    private DataExport.Passkey passkey(String id) {
        return jdbc.sql("SELECT c.created, c.last_used FROM user_credentials c "
                        + "JOIN user_entities e ON e.id = c.user_entity_user_id WHERE e.name = ?")
                .param(id)
                .query((row, number) -> new DataExport.Passkey(timestamp(row, 1), timestamp(row, 2)))
                .optional().orElse(null);
    }

    private List<DataExport.Event> events(String id) {
        return jdbc.sql("SELECT type, outcome, ip_address, occurred_at FROM security_event WHERE account_id = ? "
                        + "ORDER BY occurred_at DESC, id DESC")
                .param(id)
                .query((row, number) -> new DataExport.Event(row.getString(1), row.getString(2), row.getString(3),
                        instant(row, 4)))
                .list();
    }

    private List<DataExport.Match> matches(String id) {
        record Played(String matchId, String endedAt, String mode, String variant, String difficulty,
                      String yourTeam, int northSouthScore, int eastWestScore, String winningTeam) {
        }
        List<Played> played = jdbc.sql("SELECT m.id, m.ended_at, m.mode, m.variant, m.difficulty, s.team, "
                        + "m.north_south_score, m.east_west_score, m.winning_team FROM match_record m "
                        + "JOIN match_seat s ON s.match_id = m.id WHERE s.account_id = ? ORDER BY m.ended_at DESC")
                .param(id)
                .query((row, number) -> new Played(row.getString(1), instant(row, 2), row.getString(3),
                        row.getString(4), row.getString(5), row.getString(6), row.getInt(7), row.getInt(8),
                        row.getString(9)))
                .list();
        List<DataExport.Match> matches = new ArrayList<>();
        for (Played match : played) {
            List<DataExport.Seat> seats = jdbc.sql("SELECT position, name, team, bot FROM match_seat "
                            + "WHERE match_id = ? ORDER BY position")
                    .param(match.matchId())
                    .query((row, number) -> new DataExport.Seat(row.getInt(1), row.getString(2), row.getString(3),
                            row.getBoolean(4)))
                    .list();
            List<DataExport.Round> rounds = jdbc.sql("SELECT declaring_team, trump, contract_value, coinched, "
                            + "contract_made, capot_team, belote_team, north_south_points, east_west_points "
                            + "FROM match_round WHERE match_id = ? ORDER BY round_index")
                    .param(match.matchId())
                    .query((row, number) -> new DataExport.Round(row.getString(1), row.getString(2),
                            row.getObject(3, Integer.class), row.getBoolean(4), row.getBoolean(5), row.getString(6),
                            row.getString(7), row.getInt(8), row.getInt(9)))
                    .list();
            matches.add(new DataExport.Match(match.endedAt(), match.mode(), match.variant(), match.difficulty(),
                    match.yourTeam(), match.northSouthScore(), match.eastWestScore(),
                    match.yourTeam().equals(match.winningTeam()), seats, rounds));
        }
        return matches;
    }

    private static String timestamp(ResultSet row, int column) throws SQLException {
        Timestamp time = row.getTimestamp(column);
        return time == null ? null : time.toInstant().toString();
    }

    private static String instant(ResultSet row, int column) throws SQLException {
        LocalDateTime time = row.getObject(column, LocalDateTime.class);
        return time == null ? null : time.toInstant(ZoneOffset.UTC).toString();
    }
}
