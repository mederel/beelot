package fr.beelot.application.privacy;

import fr.beelot.application.account.AccountService;
import fr.beelot.application.account.PasskeySignIn;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Deleting an account (US-081), end to end, on a MariaDB database migrated by Flyway. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AccountDeletionIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:12.3");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private AccountService accounts;

    @Autowired
    private AccountSessions sessions;

    @Test
    void deletionRemovesTheAccountAndItsData() throws Exception {
        UUID account = newAccount();
        jdbc.sql("INSERT INTO security_event (account_id, type, outcome, occurred_at) VALUES (?, 'SIGN_IN', 'SUCCESS', ?)")
                .params(account.toString(), now()).update();
        long deletionsBefore = count("SELECT COUNT(*) FROM security_event WHERE type = 'DELETION'");

        mockMvc.perform(delete("/api/account").session(new MockHttpSession()).with(PasskeySignIn.as(account))
                .with(csrf())).andExpect(status().isNoContent());

        assertThat(count("SELECT COUNT(*) FROM account WHERE id = ?", account)).isZero();
        assertThat(count("SELECT COUNT(*) FROM security_event WHERE account_id = ?", account)).isZero();
        assertThat(count("SELECT COUNT(*) FROM security_event WHERE type = 'DELETION' AND outcome = 'SUCCESS' "
                + "AND account_id IS NULL")).isEqualTo(deletionsBefore + 1);
    }

    @Test
    void matchesStayWithTheSeatRenamed() throws Exception {
        UUID account = newAccount();
        UUID other = newAccount();
        UUID match = UUID.randomUUID();
        jdbc.sql("INSERT INTO match_record (id, ended_at, mode, variant, difficulty, north_south_score, "
                        + "east_west_score, winning_team) VALUES (?, ?, 'PRIVATE', 'CLASSIC', NULL, 1010, 600, "
                        + "'NORTH_SOUTH')")
                .params(match.toString(), now()).update();
        seat(match, 0, account, "Swift Otter 42", "NORTH_SOUTH", false);
        seat(match, 1, other, "Other Otter 7", "EAST_WEST", false);
        seat(match, 2, null, "Camille", "NORTH_SOUTH", true);
        seat(match, 3, null, "Luc", "EAST_WEST", true);

        mockMvc.perform(delete("/api/account").session(new MockHttpSession()).with(PasskeySignIn.as(account))
                .with(csrf())).andExpect(status().isNoContent());

        Map<String, Object> deleted = seatRow(match, 0);
        Map<String, Object> kept = seatRow(match, 1);
        assertThat(count("SELECT COUNT(*) FROM match_record WHERE id = ?", match)).isEqualTo(1);
        assertThat(deleted.get("account_id")).isNull();
        assertThat(deleted.get("name")).isEqualTo("Deleted player");
        assertThat(String.valueOf(kept.get("account_id"))).isEqualTo(other.toString());
        assertThat(kept.get("name")).isEqualTo("Other Otter 7");
    }

    @Test
    void deletionEndsEverySession() throws Exception {
        UUID account = newAccount();
        MockHttpSession first = new MockHttpSession();
        MockHttpSession second = new MockHttpSession();
        sessions.signedIn(account, first);
        sessions.signedIn(account, second);

        mockMvc.perform(delete("/api/account").session(first).with(PasskeySignIn.as(account)).with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(second.isInvalid()).isTrue();
        mockMvc.perform(get("/api/account").session(new MockHttpSession()).with(PasskeySignIn.as(account)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(false));
    }

    @Test
    void signInTenMinutesOldMustReauthenticate() throws Exception {
        UUID account = newAccount();

        mockMvc.perform(delete("/api/account").session(new MockHttpSession()).with(PasskeySignIn.as(account))
                        .with(request -> {
                            request.getSession().setAttribute(AccountSessions.SIGNED_IN_AT,
                                    Instant.now().minus(Duration.ofMinutes(10)));
                            return request;
                        }).with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("reauthenticate"));

        assertThat(count("SELECT COUNT(*) FROM account WHERE id = ?", account)).isEqualTo(1);
    }

    @Test
    void deletionNeedsCsrf() throws Exception {
        UUID account = newAccount();

        mockMvc.perform(delete("/api/account").session(new MockHttpSession()).with(PasskeySignIn.as(account)))
                .andExpect(status().isForbidden());

        assertThat(count("SELECT COUNT(*) FROM account WHERE id = ?", account)).isEqualTo(1);
    }

    @Test
    void guestCannotDelete() throws Exception {
        mockMvc.perform(delete("/api/account").with(csrf())).andExpect(status().isUnauthorized());
    }

    private UUID newAccount() {
        return accounts.create(Locale.ENGLISH).id();
    }

    private void seat(UUID match, int position, UUID account, String name, String team, boolean bot) {
        jdbc.sql("INSERT INTO match_seat (match_id, position, account_id, name, team, bot) VALUES (?, ?, ?, ?, ?, ?)")
                .params(match.toString(), position, account == null ? null : account.toString(), name, team, bot)
                .update();
    }

    private Map<String, Object> seatRow(UUID match, int position) {
        return jdbc.sql("SELECT account_id, name FROM match_seat WHERE match_id = ? AND position = ?")
                .params(match.toString(), position).query().singleRow();
    }

    private static LocalDateTime now() {
        return LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
    }

    private long count(String sql, Object... params) {
        Object[] values = new Object[params.length];
        for (int i = 0; i < params.length; i++) {
            values[i] = params[i] instanceof UUID id ? id.toString() : params[i];
        }
        return jdbc.sql(sql).params(values).query(Long.class).single();
    }
}
