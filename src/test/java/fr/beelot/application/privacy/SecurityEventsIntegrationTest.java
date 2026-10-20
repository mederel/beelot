package fr.beelot.application.privacy;

import fr.beelot.application.account.AccountService;
import fr.beelot.application.account.PasskeySignIn;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.session.HttpSessionDestroyedEvent;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.util.Locale;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Security events recorded while players sign out and their sessions expire, on a MariaDB database migrated by Flyway. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SecurityEventsIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:12.3");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ApplicationContext context;

    @Autowired
    private AccountService accounts;

    @Test
    void signOutIsRecordedAndNotAsExpiry() throws Exception {
        UUID account = accounts.create(Locale.ENGLISH).id();
        MockHttpSession session = new MockHttpSession();

        mockMvc.perform(post("/logout").session(session).with(PasskeySignIn.as(account)).with(csrf()))
                .andExpect(status().isNoContent());
        context.publishEvent(new HttpSessionDestroyedEvent(session));

        assertThat(eventsOf(account, "SIGN_OUT", "SUCCESS")).isEqualTo(1);
        assertThat(eventsOf(account, "SESSION_EXPIRED", "SUCCESS")).isZero();
    }

    @Test
    void expiredSessionIsRecorded() throws Exception {
        UUID account = accounts.create(Locale.ENGLISH).id();
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(SecurityEvents.ACCOUNT_ID, account);

        context.publishEvent(new HttpSessionDestroyedEvent(session));
        session.invalidate();

        assertThat(eventsOf(account, "SESSION_EXPIRED", "SUCCESS")).isEqualTo(1);
    }

    private long eventsOf(UUID account, String type, String outcome) {
        return jdbc.sql("SELECT COUNT(*) FROM security_event WHERE account_id = ? AND type = ? AND outcome = ?")
                .params(account.toString(), type, outcome).query(Long.class).single();
    }
}
