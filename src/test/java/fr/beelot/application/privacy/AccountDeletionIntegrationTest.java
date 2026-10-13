package fr.beelot.application.privacy;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Deleting an account (US-081), end to end, on a MariaDB database migrated by Flyway. The per-IP limit is raised:
 * every request here comes from one address.
 */
@SpringBootTest(properties = "beelot.sign-in.limit-per-ip=1000")
@AutoConfigureMockMvc
@Testcontainers
class AccountDeletionIntegrationTest {

    private static final Pattern TOKEN = Pattern.compile("/sign-in\\?token=([A-Za-z0-9_-]{43})");

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @MockitoBean
    private JavaMailSender mail;

    @Test
    void deletionRemovesTheAccountAndItsData() throws Exception {
        MockHttpSession session = signIn(requestLink("gone@example.com"));
        UUID account = accountOf("gone@example.com");
        requestLink("gone@example.com");
        long deletionsBefore = count("SELECT COUNT(*) FROM security_event WHERE type = 'DELETION'");

        mockMvc.perform(delete("/api/account").session(session).with(csrf())).andExpect(status().isNoContent());

        assertThat(count("SELECT COUNT(*) FROM account WHERE id = ?", account)).isZero();
        assertThat(count("SELECT COUNT(*) FROM account_email WHERE email = ?", "gone@example.com")).isZero();
        assertThat(count("SELECT COUNT(*) FROM sign_in_token WHERE email = ?", "gone@example.com")).isZero();
        assertThat(count("SELECT COUNT(*) FROM security_event WHERE account_id = ?", account)).isZero();
        assertThat(count("SELECT COUNT(*) FROM security_event WHERE type = 'DELETION' AND outcome = 'SUCCESS' "
                + "AND account_id IS NULL")).isEqualTo(deletionsBefore + 1);
    }

    @Test
    void matchesStayWithTheSeatRenamed() throws Exception {
        MockHttpSession session = signIn(requestLink("player@example.com"));
        UUID account = accountOf("player@example.com");
        UUID other = UUID.randomUUID();
        jdbc.sql("INSERT INTO account (id, provider, provider_subject, display_name, created_at, last_sign_in_at) "
                        + "VALUES (?, 'google', ?, 'Other Otter 7', ?, ?)")
                .params(other.toString(), other.toString(), now(), now()).update();
        UUID match = UUID.randomUUID();
        jdbc.sql("INSERT INTO match_record (id, ended_at, mode, variant, difficulty, north_south_score, "
                        + "east_west_score, winning_team) VALUES (?, ?, 'PRIVATE', 'CLASSIC', NULL, 1010, 600, "
                        + "'NORTH_SOUTH')")
                .params(match.toString(), now()).update();
        seat(match, 0, account, "Swift Otter 42", "NORTH_SOUTH", false);
        seat(match, 1, other, "Other Otter 7", "EAST_WEST", false);
        seat(match, 2, null, "Camille", "NORTH_SOUTH", true);
        seat(match, 3, null, "Luc", "EAST_WEST", true);

        mockMvc.perform(delete("/api/account").session(session).with(csrf())).andExpect(status().isNoContent());

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
        MockHttpSession first = signIn(requestLink("twice@example.com"));
        MockHttpSession second = signIn(requestLink("twice@example.com"));

        mockMvc.perform(delete("/api/account").session(first).with(csrf())).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/account").session(second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(false));
        assertThat(second.isInvalid()).isTrue();
    }

    @Test
    void signInTenMinutesOldMustReauthenticate() throws Exception {
        MockHttpSession session = signIn(requestLink("old@example.com"));
        session.setAttribute(AccountSessions.SIGNED_IN_AT, Instant.now().minus(Duration.ofMinutes(10)));

        mockMvc.perform(delete("/api/account").session(session).with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("reauthenticate"));

        assertThat(count("SELECT COUNT(*) FROM account_email WHERE email = ?", "old@example.com")).isEqualTo(1);
    }

    @Test
    void deletionNeedsCsrf() throws Exception {
        MockHttpSession session = signIn(requestLink("csrf-delete@example.com"));

        mockMvc.perform(delete("/api/account").session(session)).andExpect(status().isForbidden());

        assertThat(count("SELECT COUNT(*) FROM account_email WHERE email = ?", "csrf-delete@example.com"))
                .isEqualTo(1);
    }

    @Test
    void guestCannotDelete() throws Exception {
        mockMvc.perform(delete("/api/account").with(csrf())).andExpect(status().isUnauthorized());
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

    private String requestLink(String address) throws Exception {
        mockMvc.perform(post("/api/sign-in/link").param("username", address).with(csrf()))
                .andExpect(status().isNoContent());
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail, atLeastOnce()).send(captor.capture());
        Matcher token = TOKEN.matcher(captor.getAllValues().getLast().getText());
        assertThat(token.find()).isTrue();
        return token.group(1);
    }

    private MockHttpSession signIn(String token) throws Exception {
        MvcResult result = mockMvc.perform(post("/login/ott").param("token", token).with(csrf()))
                .andExpect(status().isNoContent())
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private UUID accountOf(String email) {
        return jdbc.sql("SELECT account_id FROM account_email WHERE email = ?").param(email).query(UUID.class)
                .single();
    }

    private long count(String sql, Object... params) {
        Object[] values = new Object[params.length];
        for (int i = 0; i < params.length; i++) {
            values[i] = params[i] instanceof UUID id ? id.toString() : params[i];
        }
        return jdbc.sql(sql).params(values).query(Long.class).single();
    }
}
