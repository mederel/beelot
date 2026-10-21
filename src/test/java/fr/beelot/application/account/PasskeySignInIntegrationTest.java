package fr.beelot.application.account;

import fr.beelot.application.privacy.AccountSessions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import jakarta.servlet.http.Cookie;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

import static fr.beelot.application.account.BrowserCsrf.csrfToken;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Signing in with a passkey (US-084) made by signing up, through Spring Security's WebAuthn endpoints, on MariaDB.
 * The CSRF token is sent as the browser sends it ({@link BrowserCsrf}).
 */
@SpringBootTest(properties = {"beelot.public-url=http://localhost",
        "beelot.passkey.limit-per-ip=1000"})
@AutoConfigureMockMvc
@Testcontainers
class PasskeySignInIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    private final SoftwarePasskey passkey = new SoftwarePasskey();
    private MockHttpSession signedUp;
    private String accountId;

    /** Signs up with the passkey, then signs out, leaving a fresh session to sign in with. */
    @BeforeEach
    void signUpThenSignOut() throws Exception {
        jdbc.sql("DELETE FROM security_event").update();
        jdbc.sql("DELETE FROM user_credentials").update();
        jdbc.sql("DELETE FROM user_entities").update();
        jdbc.sql("DELETE FROM account").update();
        signedUp = new MockHttpSession();
        String options = mockMvc.perform(post("/api/sign-up/options").param("language", "fr").session(signedUp)
                        .with(csrfToken()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        mockMvc.perform(post("/api/sign-up").contentType(MediaType.APPLICATION_JSON)
                        .content(passkey.register(options)).session(signedUp).with(csrfToken()))
                .andExpect(status().isNoContent());
        accountId = jdbc.sql("SELECT id FROM account").query(String.class).single();
    }

    @Test
    void signInWithThePasskey() throws Exception {
        signOut(signedUp);
        LocalDateTime signedUpAt = jdbc.sql("SELECT last_sign_in_at FROM account")
                .query(LocalDateTime.class).single();
        MockHttpSession session = new MockHttpSession();
        String options = options(session).andExpect(status().isOk())
                .andExpect(jsonPath("$.allowCredentials").isEmpty())
                .andExpect(jsonPath("$.userVerification").value("required"))
                .andReturn().getResponse().getContentAsString();
        String before = session.getId();

        signIn(session, passkey.signIn(options)).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/account").session(session))
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.name").value(
                        jdbc.sql("SELECT display_name FROM account").query(String.class).single()));
        assertEquals(signedUpAt, jdbc.sql("SELECT previous_sign_in_at FROM account")
                .query(LocalDateTime.class).single());
        assertNotEquals(before, session.getId());
        assertEquals(2, events(accountId, "SIGN_IN", "SUCCESS"));
    }

    @Test
    void signingInTwiceWorks() throws Exception {
        signOut(signedUp);
        MockHttpSession first = new MockHttpSession();
        signIn(first, passkey.signIn(options(first).andReturn().getResponse().getContentAsString()))
                .andExpect(status().isNoContent());
        long counter = jdbc.sql("SELECT signature_count FROM user_credentials").query(Long.class).single();
        signOut(first);
        MockHttpSession second = new MockHttpSession();

        signIn(second, passkey.signIn(options(second).andReturn().getResponse().getContentAsString()))
                .andExpect(status().isNoContent());

        assertTrue(counter > 0, "counter " + counter);
        assertTrue(jdbc.sql("SELECT signature_count FROM user_credentials").query(Long.class).single() > counter);
        assertEquals(3, events(accountId, "SIGN_IN", "SUCCESS"));
    }

    @Test
    void signInReplacesTheCsrfToken() throws Exception {
        signOut(signedUp);
        MockHttpSession session = new MockHttpSession();
        String options = options(session).andReturn().getResponse().getContentAsString();

        Cookie token = signIn(session, passkey.signIn(options)).andExpect(status().isNoContent())
                .andReturn().getResponse().getCookie("XSRF-TOKEN");

        assertNotNull(token);
        assertNotEquals(BrowserCsrf.value(), token.getValue());
    }

    @Test
    void unknownPasskeyFails() throws Exception {
        signOut(signedUp);
        // A passkey made for a sign-up that was never finished: Beelot does not know it.
        SoftwarePasskey unknown = new SoftwarePasskey();
        unknown.register(mockMvc.perform(post("/api/sign-up/options").param("language", "fr")
                .session(new MockHttpSession()).with(csrfToken())).andReturn().getResponse().getContentAsString());
        MockHttpSession session = new MockHttpSession();
        String options = options(session).andReturn().getResponse().getContentAsString();

        signIn(session, unknown.signIn(options)).andExpect(status().isUnauthorized()).andExpect(content().string(""));

        assertEquals(1, anonymousFailures());
        mockMvc.perform(get("/api/account").session(session)).andExpect(jsonPath("$.signedIn").value(false));
    }

    @Test
    void counterGoingBackwardsFails() throws Exception {
        signOut(signedUp);
        jdbc.sql("UPDATE user_credentials SET signature_count = 1000000").update();
        MockHttpSession session = new MockHttpSession();
        String options = options(session).andReturn().getResponse().getContentAsString();

        signIn(session, passkey.signIn(options)).andExpect(status().isUnauthorized()).andExpect(content().string(""));

        assertEquals(1, anonymousFailures());
    }

    @Test
    void signInWithoutOptionsFails() throws Exception {
        signOut(signedUp);
        MockHttpSession other = new MockHttpSession();
        String options = options(other).andReturn().getResponse().getContentAsString();

        signIn(new MockHttpSession(), passkey.signIn(options)).andExpect(status().isUnauthorized());

        assertEquals(1, anonymousFailures());
    }

    @Test
    void registeringASecondPasskeyIsRefused() throws Exception {
        mockMvc.perform(post("/webauthn/register/options").session(signedUp).with(csrfToken()))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/webauthn/register").contentType(MediaType.APPLICATION_JSON).content("{}")
                .session(signedUp).with(csrfToken())).andExpect(status().isForbidden());
        mockMvc.perform(delete("/webauthn/register/x").session(signedUp).with(csrfToken()))
                .andExpect(status().isForbidden());

        assertEquals(1, jdbc.sql("SELECT COUNT(*) FROM user_credentials").query(Integer.class).single());
    }

    @Test
    void guestsCannotRegisterAPasskeyEither() throws Exception {
        mockMvc.perform(post("/webauthn/register/options").with(csrfToken())).andExpect(status().isForbidden());
        mockMvc.perform(post("/webauthn/register").contentType(MediaType.APPLICATION_JSON).content("{}")
                .with(csrfToken())).andExpect(status().isForbidden());
        mockMvc.perform(delete("/webauthn/register/x").with(csrfToken())).andExpect(status().isForbidden());
    }

    @Test
    void reSignInOffersOnlyTheAccountsPasskey() throws Exception {
        String credentialId = jdbc.sql("SELECT credential_id FROM user_credentials").query(String.class).single();

        options(signedUp).andExpect(status().isOk())
                .andExpect(jsonPath("$.allowCredentials.length()").value(1))
                .andExpect(jsonPath("$.allowCredentials[0].id").value(credentialId));
    }

    @Test
    void deletedAccountPasskeyFails() throws Exception {
        mockMvc.perform(delete("/api/account").session(signedUp).with(csrfToken())).andExpect(status().isNoContent());
        MockHttpSession session = new MockHttpSession();
        String options = options(session).andReturn().getResponse().getContentAsString();

        signIn(session, passkey.signIn(options)).andExpect(status().isUnauthorized()).andExpect(content().string(""));

        assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM account").query(Integer.class).single());
        mockMvc.perform(get("/api/account").session(session)).andExpect(jsonPath("$.signedIn").value(false));
    }

    @Test
    void deletionAfterTenMinutesNeedsAFreshSignIn() throws Exception {
        signedUp.setAttribute(AccountSessions.SIGNED_IN_AT, Instant.now().minus(Duration.ofMinutes(11)));

        mockMvc.perform(delete("/api/account").session(signedUp).with(csrfToken()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("reauthenticate"));
        String options = options(signedUp).andReturn().getResponse().getContentAsString();
        signIn(signedUp, passkey.signIn(options)).andExpect(status().isNoContent());

        mockMvc.perform(delete("/api/account").session(signedUp).with(csrfToken())).andExpect(status().isNoContent());
        assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM account").query(Integer.class).single());
    }

    @Test
    void signInNeedsTheCsrfToken() throws Exception {
        mockMvc.perform(post("/webauthn/authenticate/options")).andExpect(status().isForbidden());
        mockMvc.perform(post("/login/webauthn").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void springDefaultPagesAreOff() throws Exception {
        for (String page : List.of("/login", "/webauthn/register")) {
            MockHttpServletResponse response = mockMvc.perform(get(page)).andReturn().getResponse();
            assertTrue(response.getStatus() == 404 || response.getStatus() == 403, page + " " + response.getStatus());
            assertFalse(response.getContentAsString().contains("<form"), page);
        }
    }

    private void signOut(MockHttpSession session) throws Exception {
        mockMvc.perform(post("/logout").session(session).with(csrfToken())).andExpect(status().isNoContent());
    }

    private ResultActions options(MockHttpSession session) throws Exception {
        return mockMvc.perform(post("/webauthn/authenticate/options").session(session).with(csrfToken()));
    }

    private ResultActions signIn(MockHttpSession session, String body) throws Exception {
        return mockMvc.perform(post("/login/webauthn").contentType(MediaType.APPLICATION_JSON).content(body)
                .session(session).with(csrfToken()));
    }

    private int anonymousFailures() {
        return jdbc.sql("SELECT COUNT(*) FROM security_event WHERE type = 'SIGN_IN' AND outcome = 'FAILURE' "
                + "AND account_id IS NULL").query(Integer.class).single();
    }

    private int events(String accountId, String type, String outcome) {
        return jdbc.sql("SELECT COUNT(*) FROM security_event WHERE account_id = ? AND type = ? AND outcome = ?")
                .params(accountId, type, outcome).query(Integer.class).single();
    }
}
