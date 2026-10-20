package fr.beelot.application.account;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.util.Locale;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The account endpoint and the CSRF rules, on a MariaDB database migrated by Flyway. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AccountIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:12.3");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AccountService accounts;

    @Test
    void aGuestIsNotSignedIn() throws Exception {
        mockMvc.perform(get("/api/account"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(false))
                .andExpect(jsonPath("$.name").doesNotExist());
    }

    @Test
    void aPasskeyPlayerIsSignedInUnderTheirPseudonym() throws Exception {
        Account account = accounts.create(Locale.ENGLISH);

        mockMvc.perform(get("/api/account").with(PasskeySignIn.as(account.id())))
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.name").value(account.displayName()));
    }

    @Test
    void aPasskeyPlayerWhoseAccountIsGoneIsSignedOut() throws Exception {
        MockHttpSession session = new MockHttpSession();

        mockMvc.perform(get("/api/account").session(session).with(PasskeySignIn.as(UUID.randomUUID())))
                .andExpect(jsonPath("$.signedIn").value(false));
        assertTrue(session.isInvalid());
    }

    /** Like the browser client: it reads the token from the cookie and sends it back in a header. */
    @Test
    void aSignedInPlayerMustSendTheCsrfTokenToSignOut() throws Exception {
        MockHttpSession session = new MockHttpSession();
        Cookie token = mockMvc.perform(get("/api/account")).andReturn().getResponse().getCookie("XSRF-TOKEN");

        mockMvc.perform(post("/logout").session(session).cookie(token)).andExpect(status().isForbidden());
        mockMvc.perform(post("/logout").session(session).cookie(token).header("X-XSRF-TOKEN", token.getValue()))
                .andExpect(status().isNoContent());
    }

    @Test
    void guestsPlayWithoutACsrfToken() throws Exception {
        mockMvc.perform(post("/api/bot-games").contentType("application/json").content("{\"difficulty\":\"RELAXED\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void theServerGivesTheClientACsrfTokenCookie() throws Exception {
        mockMvc.perform(get("/api/account")).andExpect(cookie().exists("XSRF-TOKEN"));
    }
}
