package fr.beelot.application.account;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Statement;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** The passkeys-only migration (US-084), run on a database that still holds email and OAuth accounts (no Spring context). */
@Testcontainers
class PasskeysMigrationTest {

    @Container
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    private static final String GOOGLE = "00000000-0000-0000-0000-000000000001";
    private static final String EMAIL = "00000000-0000-0000-0000-000000000002";
    private static final String MATCH = "00000000-0000-0000-0000-000000000003";

    @Test
    void v8DeletesEveryAccountAndKeepsMatches() throws SQLException {
        reset();
        migrate("7");
        try (Connection connection = connection(); Statement s = connection.createStatement()) {
            s.executeUpdate("INSERT INTO account (id, provider, provider_subject, display_name, created_at,"
                    + " last_sign_in_at) VALUES ('" + GOOGLE + "', 'google', 'g-1', 'Gee', NOW(6), NOW(6)),"
                    + " ('" + EMAIL + "', 'email', '" + EMAIL + "', 'Ann', NOW(6), NOW(6))");
            s.executeUpdate("INSERT INTO account_email (account_id, email) VALUES ('" + EMAIL + "', 'ann@example.org')");
            s.executeUpdate("INSERT INTO sign_in_token (token_hash, email, expires_at)"
                    + " VALUES (REPEAT('a', 64), 'ann@example.org', NOW(6))");
            s.executeUpdate("INSERT INTO email_change_token (token_hash, account_id, new_email, expires_at)"
                    + " VALUES (REPEAT('b', 64), '" + EMAIL + "', 'new@example.org', NOW(6))");
            s.executeUpdate("INSERT INTO match_record (id, ended_at, mode, variant, north_south_score,"
                    + " east_west_score, winning_team) VALUES ('" + MATCH + "', NOW(6), 'SOLO', 'CLASSIC', 1, 0,"
                    + " 'NORTH_SOUTH')");
            s.executeUpdate("INSERT INTO match_seat (match_id, position, account_id, name, team, bot)"
                    + " VALUES ('" + MATCH + "', 0, '" + EMAIL + "', 'Ann', 'NORTH_SOUTH', FALSE),"
                    + " ('" + MATCH + "', 1, NULL, 'Bot', 'EAST_WEST', TRUE)");
            s.executeUpdate("INSERT INTO security_event (account_id, type, outcome, occurred_at) VALUES"
                    + " ('" + GOOGLE + "', 'SIGN_IN', 'SUCCESS', NOW(6)), ('" + EMAIL + "', 'SIGN_IN', 'SUCCESS', NOW(6)),"
                    + " (NULL, 'LINK_REQUESTED', 'SUCCESS', NOW(6)), (NULL, 'DELETION', 'SUCCESS', NOW(6))");
        }

        migrate(null);

        try (Connection connection = connection(); Statement s = connection.createStatement()) {
            assertEquals(0, count(s, "SELECT COUNT(*) FROM account"));
            assertEquals(1, count(s, "SELECT COUNT(*) FROM match_record"));
            assertEquals(1, count(s, "SELECT COUNT(*) FROM match_seat WHERE position = 0 AND account_id IS NULL"
                    + " AND name = 'Deleted player'"));
            assertEquals(1, count(s, "SELECT COUNT(*) FROM security_event"));
            for (String table : List.of("account_email", "sign_in_token", "email_change_token")) {
                assertEquals(0, count(s, "SELECT COUNT(*) FROM information_schema.tables"
                        + " WHERE table_schema = DATABASE() AND table_name = '" + table + "'"));
            }
            for (String column : List.of("provider", "provider_subject", "deletion_warned_at")) {
                assertEquals(0, count(s, "SELECT COUNT(*) FROM information_schema.columns"
                        + " WHERE table_schema = DATABASE() AND table_name = 'account' AND column_name = '"
                        + column + "'"));
            }
            assertEquals(2, count(s, "SELECT COUNT(*) FROM information_schema.tables"
                    + " WHERE table_schema = DATABASE() AND table_name IN ('user_entities', 'user_credentials')"));
        }
    }

    @Test
    void v8AllowsOnePasskeyPerUser() throws SQLException {
        reset();
        migrate(null);
        try (Connection connection = connection(); Statement s = connection.createStatement()) {
            s.executeUpdate("INSERT INTO user_entities (id, name, display_name) VALUES ('handle', '" + GOOGLE
                    + "', 'Gee')");
            String insert = "INSERT INTO user_credentials (credential_id, user_entity_user_id, public_key,"
                    + " backup_eligible, backup_state, label) VALUES ('%s', 'handle', 'key', FALSE, FALSE, 'laptop')";
            s.executeUpdate(insert.formatted("first"));
            assertThrows(SQLIntegrityConstraintViolationException.class, () -> s.executeUpdate(insert.formatted("second")));
        }
    }

    private static void reset() {
        Flyway.configure()
                .dataSource(MARIADB.getJdbcUrl(), MARIADB.getUsername(), MARIADB.getPassword())
                .cleanDisabled(false).load().clean();
    }

    private static void migrate(String target) {
        var configuration = Flyway.configure()
                .dataSource(MARIADB.getJdbcUrl(), MARIADB.getUsername(), MARIADB.getPassword())
                .locations("classpath:db/migration");
        if (target != null) configuration.target(target);
        configuration.load().migrate();
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(MARIADB.getJdbcUrl(), MARIADB.getUsername(), MARIADB.getPassword());
    }

    private static int count(Statement statement, String sql) throws SQLException {
        try (ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getInt(1);
        }
    }
}
