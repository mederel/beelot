package fr.beelot.application.account;

import fr.beelot.application.privacy.AccountSessions;
import org.junit.jupiter.api.BeforeEach;
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
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Changing the address of an email account through the API (US-079), end to end, on a MariaDB database migrated by
 * Flyway. The mail server is replaced by a mock that captures the emails. The per-IP limit is raised: every request
 * here comes from one address.
 */
@SpringBootTest(properties = "beelot.sign-in.limit-per-ip=1000")
@AutoConfigureMockMvc
@Testcontainers
class EmailChangeIntegrationTest {

    private static final Pattern SIGN_IN = Pattern.compile("/sign-in\\?token=([A-Za-z0-9_-]{43})");
    private static final Pattern CHANGE = Pattern.compile("/settings/email\\?token=([A-Za-z0-9_-]{43})");

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private AccountService accounts;

    @MockitoBean
    private JavaMailSender mail;

    @BeforeEach
    void clearMail() {
        clearInvocations(mail);
    }

    @Test
    void theAccountShowsTheAddressOfAnEmailPlayer() throws Exception {
        MockHttpSession session = signIn("shown@example.com");

        mockMvc.perform(get("/api/account").session(session))
                .andExpect(jsonPath("$.email").value("shown@example.com"));
        mockMvc.perform(get("/api/account")).andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void aChangeMovesSignInToTheNewAddress() throws Exception {
        MockHttpSession old = signIn("api-old@example.com");
        UUID account = accountOf("api-old@example.com");

        mockMvc.perform(post("/api/account/email").session(old).with(csrf()).param("email", "api-new@example.com"))
                .andExpect(status().isNoContent());
        MvcResult confirmed = mockMvc.perform(post("/api/account/email/confirm").with(csrf())
                        .param("token", lastToken(CHANGE)).param("language", "en"))
                .andExpect(status().isNoContent())
                .andReturn();

        MockHttpSession confirming = (MockHttpSession) confirmed.getRequest().getSession(false);
        mockMvc.perform(get("/api/account").session(confirming))
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.email").value("api-new@example.com"));
        mockMvc.perform(get("/api/account").session(old)).andExpect(jsonPath("$.signedIn").value(false));
        assertThat(old.isInvalid()).isTrue();
        signIn("api-new@example.com");
        assertThat(accountOf("api-new@example.com")).isEqualTo(account);
        signIn("api-old@example.com");
        assertThat(accountOf("api-old@example.com")).isNotEqualTo(account);
    }

    @Test
    void theConfirmingBrowserStaysSignedInWhenItWasAlreadySignedIn() throws Exception {
        MockHttpSession session = signIn("same-browser-old@example.com");
        String originalId = session.getId();
        mockMvc.perform(post("/api/account/email").session(session).with(csrf())
                        .param("email", "same-browser-new@example.com"))
                .andExpect(status().isNoContent());

        MvcResult confirmed = mockMvc.perform(post("/api/account/email/confirm").session(session).with(csrf())
                        .param("token", lastToken(CHANGE)))
                .andExpect(status().isNoContent())
                .andReturn();

        MockHttpSession after = (MockHttpSession) confirmed.getRequest().getSession(false);
        assertThat(after).isNotNull();
        assertThat(after.getId()).isNotEqualTo(originalId);
        mockMvc.perform(get("/api/account").session(after))
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.email").value("same-browser-new@example.com"));
    }

    @Test
    void confirmingNeedsCsrfEvenForAGuest() throws Exception {
        MockHttpSession session = signIn("csrf-old@example.com");
        mockMvc.perform(post("/api/account/email").session(session).with(csrf()).param("email", "csrf-new@example.com"))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/account/email/confirm").param("token", lastToken(CHANGE)))
                .andExpect(status().isForbidden());

        assertThat(jdbc.sql("SELECT COUNT(*) FROM email_change_token WHERE new_email = ?")
                .param("csrf-new@example.com").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void aSpentLinkAnswers400() throws Exception {
        MockHttpSession session = signIn("spent-old@example.com");
        mockMvc.perform(post("/api/account/email").session(session).with(csrf()).param("email", "spent-new@example.com"))
                .andExpect(status().isNoContent());
        String token = lastToken(CHANGE);
        mockMvc.perform(post("/api/account/email/confirm").with(csrf()).param("token", token))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/account/email/confirm").with(csrf()).param("token", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This link no longer works."));
    }

    @Test
    void theCurrentAddressAnswers400() throws Exception {
        MockHttpSession session = signIn("current@example.com");

        mockMvc.perform(post("/api/account/email").session(session).with(csrf()).param("email", "Current@example.com"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This is already your address."));
    }

    @Test
    void aStaleSignInMustReauthenticate() throws Exception {
        MockHttpSession session = signIn("stale@example.com");
        session.setAttribute(AccountSessions.SIGNED_IN_AT, Instant.now().minus(Duration.ofMinutes(10)));
        clearInvocations(mail);

        mockMvc.perform(post("/api/account/email").session(session).with(csrf()).param("email", "stale-new@example.com"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("reauthenticate"));
        verify(mail, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void guestsAndProviderAccountsCannotChange() throws Exception {
        mockMvc.perform(post("/api/account/email").with(csrf()).param("email", "guest@example.com"))
                .andExpect(status().isUnauthorized());

        accounts.signIn("test", "user", Locale.ENGLISH);
        mockMvc.perform(post("/api/account/email").with(oauth2Login()).with(csrf())
                        .param("email", "provider@example.com"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").doesNotExist());
        mockMvc.perform(get("/api/account").with(oauth2Login())).andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void theConfirmationViewIsServed() throws Exception {
        mockMvc.perform(get("/settings/email").param("token", "x")).andExpect(forwardedUrl("/index.html"));
    }

    private MockHttpSession signIn(String email) throws Exception {
        mockMvc.perform(post("/api/sign-in/link").param("username", email).with(csrf()))
                .andExpect(status().isNoContent());
        MvcResult result = mockMvc.perform(post("/login/ott").param("token", lastToken(SIGN_IN)).with(csrf()))
                .andExpect(status().isNoContent())
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private String lastToken(Pattern pattern) {
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail, atLeast(1)).send(captor.capture());
        List<SimpleMailMessage> sent = captor.getAllValues();
        for (int i = sent.size() - 1; i >= 0; i--) {
            Matcher matcher = pattern.matcher(sent.get(i).getText());
            if (matcher.find()) return matcher.group(1);
        }
        throw new AssertionError("No link sent");
    }

    private UUID accountOf(String email) {
        return jdbc.sql("SELECT account_id FROM account_email WHERE email = ?").param(email).query(UUID.class)
                .single();
    }
}
