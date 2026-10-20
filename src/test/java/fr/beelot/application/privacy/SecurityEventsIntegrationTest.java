package fr.beelot.application.privacy;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.session.HttpSessionDestroyedEvent;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Security events recorded while players request links, sign in and out, on a MariaDB database migrated by Flyway.
 * The per-IP limit is raised: every request here comes from one address.
 */
@SpringBootTest(properties = "beelot.sign-in.limit-per-ip=1000")
@AutoConfigureMockMvc
@Testcontainers
class SecurityEventsIntegrationTest {

    private static final Pattern TOKEN = Pattern.compile("/sign-in\\?token=([A-Za-z0-9_-]{43})");

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:12.3");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ApplicationContext context;

    @MockitoBean
    private JavaMailSender mail;

    @Test
    void linkRequestIsRecordedWithoutAccount() throws Exception {
        long before = count("LINK_REQUESTED", "SUCCESS");

        requestLink("link-event@example.com");

        List<Map<String, Object>> rows = jdbc.sql("SELECT * FROM security_event WHERE type = 'LINK_REQUESTED' "
                + "ORDER BY id DESC LIMIT 1").query().listOfRows();
        assertThat(count("LINK_REQUESTED", "SUCCESS")).isEqualTo(before + 1);
        assertThat(rows.getFirst().get("account_id")).isNull();
        assertThat(rows.getFirst().get("ip_address")).isEqualTo("127.0.0.1");
        assertThat(rows.getFirst().get("outcome")).isEqualTo("SUCCESS");
    }

    @Test
    void rateLimitRefusalIsRecorded() throws Exception {
        long before = count("RATE_LIMITED", "REFUSED");
        for (int i = 0; i < 3; i++) {
            requestLink("limited-event@example.com");
        }

        mockMvc.perform(post("/api/sign-in/link").param("username", "limited-event@example.com").with(csrf()))
                .andExpect(status().isTooManyRequests());

        assertThat(count("RATE_LIMITED", "REFUSED")).isEqualTo(before + 1);
    }

    @Test
    void emailSignInIsRecordedWithTheAccount() throws Exception {
        MockHttpSession session = signIn(requestLink("signin-event@example.com"));

        UUID account = accountOf("signin-event@example.com");
        assertThat(eventsOf(account, "SIGN_IN", "SUCCESS")).isEqualTo(1);
        assertThat(session.getAttribute(SecurityEvents.ACCOUNT_ID)).isEqualTo(account);
    }

    @Test
    void usedLinkIsRecordedAsFailedSignIn() throws Exception {
        String token = requestLink("used-event@example.com");
        signIn(token);
        long before = count("SIGN_IN", "FAILURE");

        mockMvc.perform(post("/login/ott").param("token", token).with(csrf())).andExpect(status().isUnauthorized());

        assertThat(count("SIGN_IN", "FAILURE")).isEqualTo(before + 1);
        assertThat(jdbc.sql("SELECT account_id FROM security_event WHERE type = 'SIGN_IN' AND outcome = 'FAILURE' "
                + "ORDER BY id DESC LIMIT 1").query().singleRow().get("account_id")).isNull();
    }

    @Test
    void signOutIsRecordedAndNotAsExpiry() throws Exception {
        MockHttpSession session = signIn(requestLink("signout-event@example.com"));
        UUID account = accountOf("signout-event@example.com");

        mockMvc.perform(post("/logout").session(session).with(csrf())).andExpect(status().isNoContent());
        context.publishEvent(new HttpSessionDestroyedEvent(session));

        assertThat(eventsOf(account, "SIGN_OUT", "SUCCESS")).isEqualTo(1);
        assertThat(eventsOf(account, "SESSION_EXPIRED", "SUCCESS")).isZero();
    }

    @Test
    void expiredSessionIsRecorded() throws Exception {
        MockHttpSession session = signIn(requestLink("expired-event@example.com"));
        UUID account = accountOf("expired-event@example.com");

        context.publishEvent(new HttpSessionDestroyedEvent(session));
        session.invalidate();

        assertThat(eventsOf(account, "SESSION_EXPIRED", "SUCCESS")).isEqualTo(1);
    }

    @Test
    void noTokenIsEverStored() throws Exception {
        String token = requestLink("token-event@example.com");
        signIn(token);
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(token.getBytes(StandardCharsets.UTF_8)));

        List<Map<String, Object>> rows = jdbc.sql("SELECT * FROM security_event").query().listOfRows();
        assertThat(rows).isNotEmpty();
        for (Map<String, Object> row : rows) {
            for (Object value : row.values()) {
                assertThat(String.valueOf(value)).doesNotContain(token).doesNotContainIgnoringCase(hash);
            }
        }
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

    private long count(String type, String outcome) {
        return jdbc.sql("SELECT COUNT(*) FROM security_event WHERE type = ? AND outcome = ?")
                .params(type, outcome).query(Long.class).single();
    }

    private long eventsOf(UUID account, String type, String outcome) {
        return jdbc.sql("SELECT COUNT(*) FROM security_event WHERE account_id = ? AND type = ? AND outcome = ?")
                .params(account, type, outcome).query(Long.class).single();
    }
}
