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
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** The email accounts migration, run on a database that still holds a Zitadel account (no Spring context). */
@Testcontainers
class EmailAccountsMigrationTest {

    @Container
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    private static final String ZITADEL = "00000000-0000-0000-0000-000000000001";
    private static final String GOOGLE = "00000000-0000-0000-0000-000000000002";
    private static final String MATCH = "00000000-0000-0000-0000-000000000003";

    @Test
    void theMigrationDeletesZitadelAccounts() throws SQLException {
        migrate("3");
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("INSERT INTO account (id, provider, provider_subject, display_name, created_at,"
                    + " last_sign_in_at) VALUES ('" + ZITADEL + "', 'zitadel', 'z-1', 'Zed', NOW(6), NOW(6)),"
                    + " ('" + GOOGLE + "', 'google', 'g-1', 'Gee', NOW(6), NOW(6))");
            statement.executeUpdate("INSERT INTO match_record (id, ended_at, mode, variant, north_south_score,"
                    + " east_west_score, winning_team) VALUES ('" + MATCH + "', NOW(6), 'SOLO', 'CLASSIC', 1, 0,"
                    + " 'NORTH_SOUTH')");
            statement.executeUpdate("INSERT INTO match_seat (match_id, position, account_id, name, team, bot)"
                    + " VALUES ('" + MATCH + "', 0, '" + ZITADEL + "', 'Zed', 'NORTH_SOUTH', FALSE),"
                    + " ('" + MATCH + "', 1, '" + GOOGLE + "', 'Gee', 'EAST_WEST', FALSE)");
        }

        migrate(null);

        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            assertEquals(0, count(statement, "SELECT COUNT(*) FROM account WHERE provider = 'zitadel'"));
            assertEquals(1, count(statement, "SELECT COUNT(*) FROM account WHERE provider = 'google'"));
            assertEquals(0, count(statement, "SELECT COUNT(*) FROM match_record"));
            assertEquals(0, count(statement, "SELECT COUNT(*) FROM match_seat"));
        }
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
