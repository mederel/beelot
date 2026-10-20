package fr.beelot.application.account;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.util.Locale;

import static fr.beelot.application.account.BrowserCsrf.csrfToken;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Signing up with a passkey (US-084), from the creation options to a signed-in session, on MariaDB. The CSRF token is
 * sent as the browser sends it ({@link BrowserCsrf}).
 */
@SpringBootTest(properties = "beelot.public-url=http://localhost")
@AutoConfigureMockMvc
@Testcontainers
class PasskeySignUpIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    private final MockHttpSession session = new MockHttpSession();

    @BeforeEach
    void startEmpty() {
        jdbc.sql("DELETE FROM security_event").update();
        jdbc.sql("DELETE FROM user_credentials").update();
        jdbc.sql("DELETE FROM user_entities").update();
        jdbc.sql("DELETE FROM account").update();
    }

    @Test
    void signUpCreatesOneAccountAndSignsIn() throws Exception {
        String options = options(session).andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticatorSelection.residentKey").value("required"))
                .andExpect(jsonPath("$.authenticatorSelection.userVerification").value("required"))
                .andExpect(jsonPath("$.rp.id").value("localhost"))
                .andReturn().getResponse().getContentAsString();
        String pseudonym = JsonPath.read(options, "$.user.displayName");
        assertTrue(PseudonymGenerator.all(Locale.FRENCH).contains(PseudonymGeneratorTest.withoutNumber(pseudonym)),
                pseudonym);

        signUp(session, new SoftwarePasskey().register(options)).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/account").session(session))
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.name").value(pseudonym));
        assertEquals(1, count("account"));
        assertEquals(1, count("user_credentials"));
        String accountId = jdbc.sql("SELECT id FROM account").query(String.class).single();
        assertEquals(1, events(accountId, "SIGN_UP", "SUCCESS"));
        assertEquals(1, events(accountId, "SIGN_IN", "SUCCESS"));
    }

    @Test
    void cancelledSignUpCreatesNoAccount() throws Exception {
        String first = options(session).andReturn().getResponse().getContentAsString();

        String second = options(session).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertNotEquals(JsonPath.read(first, "$.challenge"), JsonPath.<String>read(second, "$.challenge"));
        assertEquals(0, count("account"));
    }

    @Test
    void finishTwiceIsRefused() throws Exception {
        String body = new SoftwarePasskey().register(options(session).andReturn().getResponse().getContentAsString());
        signUp(session, body).andExpect(status().isNoContent());

        signUp(session, body).andExpect(status().isBadRequest());

        assertEquals(1, count("account"));
        assertEquals(1, count("user_credentials"));
    }

    @Test
    void finishWithoutOptionsIsRefused() throws Exception {
        String body = new SoftwarePasskey().register(options(session).andReturn().getResponse().getContentAsString());

        signUp(new MockHttpSession(), body).andExpect(status().isBadRequest());

        assertEquals(0, count("account"));
        assertEquals(1, jdbc.sql("SELECT COUNT(*) FROM security_event WHERE type = 'SIGN_UP' AND outcome = 'FAILURE' "
                + "AND account_id IS NULL").query(Integer.class).single());
    }

    @Test
    void wrongOriginIsRefused() throws Exception {
        String options = options(session).andReturn().getResponse().getContentAsString();

        signUp(session, new SoftwarePasskey("http://evil.example").register(options))
                .andExpect(status().isBadRequest());

        assertEquals(0, count("account"));
        assertEquals(0, count("user_credentials"));
    }

    @Test
    void signUpNeedsTheCsrfToken() throws Exception {
        mockMvc.perform(post("/api/sign-up/options").param("language", "fr")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/sign-up").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void signUpChangesTheSessionId() throws Exception {
        String body = new SoftwarePasskey().register(options(session).andReturn().getResponse().getContentAsString());
        String before = session.getId();

        signUp(session, body).andExpect(status().isNoContent());

        assertNotEquals(before, session.getId());
    }

    private ResultActions options(MockHttpSession session) throws Exception {
        return mockMvc.perform(post("/api/sign-up/options").param("language", "fr").session(session).with(csrfToken()));
    }

    private ResultActions signUp(MockHttpSession session, String body) throws Exception {
        return mockMvc.perform(post("/api/sign-up").contentType(MediaType.APPLICATION_JSON).content(body)
                .session(session).with(csrfToken()));
    }

    private int count(String table) {
        return jdbc.sql("SELECT COUNT(*) FROM " + table).query(Integer.class).single();
    }

    private int events(String accountId, String type, String outcome) {
        return jdbc.sql("SELECT COUNT(*) FROM security_event WHERE account_id = ? AND type = ? AND outcome = ?")
                .params(accountId, type, outcome).query(Integer.class).single();
    }
}
