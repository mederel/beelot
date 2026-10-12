package fr.beelot.application.account;

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
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.net.URI;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Signing in with a link sent by email, end to end, on a MariaDB database migrated by Flyway. The mail server is
 * replaced by a mock that captures the emails. The per-IP limit is raised: every request here comes from one address.
 */
@SpringBootTest(properties = "beelot.sign-in.limit-per-ip=1000")
@AutoConfigureMockMvc
@Testcontainers
class EmailSignInIntegrationTest {

    private static final Pattern TOKEN = Pattern.compile("/sign-in\\?token=([A-Za-z0-9_-]{43})");

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ApplicationContext context;

    @MockitoBean
    private JavaMailSender mail;

    @Test
    void aLinkRequestNeedsTheCsrfToken() throws Exception {
        mockMvc.perform(post("/api/sign-in/link").param("username", "csrf@example.com"))
                .andExpect(status().isForbidden());

        verify(mail, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void knownAndUnknownAddressesGetTheSameAnswerAndEmail() throws Exception {
        MockHttpSession session = signIn(requestLink("known@example.com"));
        mockMvc.perform(post("/logout").session(session).with(csrf())).andExpect(status().isNoContent());

        requestLink("known@example.com");
        requestLink("unknown@example.com");

        List<SimpleMailMessage> emails = sentEmails(3);
        SimpleMailMessage known = emails.get(1);
        SimpleMailMessage unknown = emails.get(2);
        assertThat(known.getSubject()).isEqualTo(unknown.getSubject());
        assertThat(masked(known.getText())).isEqualTo(masked(unknown.getText()));
    }

    @Test
    void theLinkSignsThePlayerInOnce() throws Exception {
        String token = requestLink("once@example.com");

        MockHttpSession session = signIn(token);
        mockMvc.perform(get("/api/account").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.name").isNotEmpty());

        mockMvc.perform(post("/login/ott").param("token", token).with(csrf()))
                .andExpect(status().isUnauthorized());
        assertThat(emailRows("once@example.com")).isEqualTo(1);
    }

    @Test
    void anUnknownTokenIsRefused() throws Exception {
        mockMvc.perform(post("/login/ott").param("token", "A".repeat(43)).with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenPostedWithoutTheCsrfTokenIsRefused() throws Exception {
        String token = requestLink("nocsrf@example.com");

        mockMvc.perform(post("/login/ott").param("token", token)).andExpect(status().isForbidden());

        signIn(token);
    }

    @Test
    void aScannerOpeningTheLinkDoesNotUseIt() throws Exception {
        String token = requestLink("scanned@example.com");

        mockMvc.perform(get("/sign-in").param("token", token))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"));

        signIn(token);
    }

    @Test
    void signingInChangesTheSessionId() throws Exception {
        String token = requestLink("session@example.com");
        MockHttpSession session = new MockHttpSession();
        String before = session.getId();

        MvcResult result = mockMvc.perform(post("/login/ott").param("token", token).session(session).with(csrf()))
                .andExpect(status().isNoContent())
                .andReturn();

        MockHttpSession after = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(after == null || after.isInvalid() || !before.equals(after.getId())).isTrue();
    }

    @Test
    void theSameAddressTypedDifferentlyReachesOneAccount() throws Exception {
        signIn(requestLink(" Jane@Example.COM "));
        signIn(requestLink("jane@example.com"));

        assertThat(emailRows("jane@example.com")).isEqualTo(1);
        assertThat(emailRows(" Jane@Example.COM ")).isZero();
    }

    /** Spring's generation filter decodes the path; a spelling it accepts must not skip the address check. */
    @Test
    void aDifferentlySpelledLinkPathIsStillChecked() throws Exception {
        for (String path : new String[]{"/api/sign-in/%6Cink", "/api/sign-in/link/", "/api/sign-in//link"}) {
            mockMvc.perform(post(URI.create(path)).param("username", "not-an-address").with(csrf()))
                    .andExpect(result -> assertThat(result.getResponse().getStatus()).as(path).isNotEqualTo(204));
        }

        verify(mail, never()).send(any(SimpleMailMessage.class));
        assertThat(jdbc.sql("SELECT COUNT(*) FROM sign_in_token WHERE email = 'not-an-address'")
                .query(Integer.class).single()).isZero();
    }

    /** The client has its own sign-in panel; Spring's generated login and token pages stay off. */
    @Test
    void springServesNoLoginPageOfItsOwn() throws Exception {
        mockMvc.perform(get("/login")).andExpect(status().isNotFound());
        mockMvc.perform(get("/login/ott")).andExpect(status().isNotFound());
    }

    @Test
    void aGuestIsOfferedEmailSignIn() throws Exception {
        mockMvc.perform(get("/api/account"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(false))
                .andExpect(jsonPath("$.emailSignIn").value(true));
    }

    /** The link's user lookup serves the one-time-token login only, never a global username/password login. */
    @Test
    void noUserDetailsServiceIsSharedWithTheRestOfTheApplication() {
        assertThat(context.getBeanNamesForType(UserDetailsService.class)).isEmpty();
    }

    /** Requests a link like the client does, checks the answer, and returns the token from the email. */
    private String requestLink(String address) throws Exception {
        mockMvc.perform(post("/api/sign-in/link").param("username", address).with(csrf()))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        List<SimpleMailMessage> emails = sentEmails(-1);
        Matcher token = TOKEN.matcher(emails.getLast().getText());
        assertThat(token.find()).isTrue();
        return token.group(1);
    }

    /** Posts the token like the client's sign-in view, and returns the signed-in session. */
    private MockHttpSession signIn(String token) throws Exception {
        MvcResult result = mockMvc.perform(post("/login/ott").param("token", token).with(csrf()))
                .andExpect(status().isNoContent())
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    /** The emails sent so far in this test; when {@code count} is not negative, exactly that many. */
    private List<SimpleMailMessage> sentEmails(int count) {
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail, count < 0 ? atLeastOnce() : times(count)).send(captor.capture());
        return captor.getAllValues();
    }

    private static String masked(String text) {
        return TOKEN.matcher(text).replaceAll("/sign-in?token=TOKEN");
    }

    private int emailRows(String email) {
        return jdbc.sql("SELECT COUNT(*) FROM account_email WHERE email = ?").param(email).query(Integer.class)
                .single();
    }
}
