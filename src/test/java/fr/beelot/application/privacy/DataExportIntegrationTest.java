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
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Downloading one's data (US-082), end to end, on a MariaDB database migrated by Flyway. The per-IP limit is raised:
 * every request here comes from one address.
 */
@SpringBootTest(properties = {
        "beelot.sign-in.limit-per-ip=1000",
        "spring.security.oauth2.client.registration.google.client-id=g",
        "spring.security.oauth2.client.registration.google.client-secret=s"})
@AutoConfigureMockMvc
@Testcontainers
class DataExportIntegrationTest {

    private static final Pattern TOKEN = Pattern.compile("/sign-in\\?token=([A-Za-z0-9_-]{43})");

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ClientRegistrationRepository registrations;

    @MockitoBean
    private JavaMailSender mail;

    @Test
    void exportHoldsAccountEventsAndMatches() throws Exception {
        MockHttpSession session = signIn(requestLink("export@example.com"));
        UUID account = accountOf("export@example.com");
        UUID match = recordMatch(account, UUID.randomUUID());

        mockMvc.perform(get("/api/account/export").session(session))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.format").value("beelot-export-1"))
                .andExpect(jsonPath("$.exportedAt").isNotEmpty())
                .andExpect(jsonPath("$.account.id").value(account.toString()))
                .andExpect(jsonPath("$.account.displayName").isNotEmpty())
                .andExpect(jsonPath("$.account.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.account.lastSignInAt").isNotEmpty())
                // Empty until the second sign-in (US-077).
                .andExpect(jsonPath("$.account.previousSignInAt").hasJsonPath())
                .andExpect(jsonPath("$.account.signIn.method").value("email"))
                .andExpect(jsonPath("$.account.signIn.email").value("export@example.com"))
                .andExpect(jsonPath("$.securityEvents[?(@.type == 'SIGN_IN')]").isNotEmpty())
                .andExpect(jsonPath("$.securityEvents[0].ipAddress").value("127.0.0.1"))
                .andExpect(jsonPath("$.matches.length()").value(1))
                .andExpect(jsonPath("$.matches[0].mode").value("PRIVATE"))
                .andExpect(jsonPath("$.matches[0].variant").value("CONTREE"))
                .andExpect(jsonPath("$.matches[0].yourTeam").value("NORTH_SOUTH"))
                .andExpect(jsonPath("$.matches[0].won").value(true))
                .andExpect(jsonPath("$.matches[0].northSouthScore").value(1010))
                .andExpect(jsonPath("$.matches[0].seats.length()").value(4))
                .andExpect(jsonPath("$.matches[0].seats[1].name").value("Other Otter 7"))
                .andExpect(jsonPath("$.matches[0].seats[2].bot").value(true))
                .andExpect(jsonPath("$.matches[0].rounds.length()").value(1))
                .andExpect(jsonPath("$.matches[0].rounds[0].contractValue").value(90))
                .andExpect(jsonPath("$.matches[0].rounds[0].coinched").value(false))
                .andExpect(jsonPath("$.matches[0].rounds[0].capotTeam").value(nullValue()));
        assertThat(match).isNotNull();
    }

    @Test
    void exportHoldsNoAccountIdsOfOthersAndNoTokens() throws Exception {
        MockHttpSession session = signIn(requestLink("private@example.com"));
        UUID other = UUID.randomUUID();
        recordMatch(accountOf("private@example.com"), other);
        requestLink("private@example.com");

        String body = mockMvc.perform(get("/api/account/export").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain(other.toString());
        List<String> hashes = jdbc.sql("SELECT token_hash FROM sign_in_token").query(String.class).list();
        assertThat(hashes).isNotEmpty();
        for (String hash : hashes) {
            assertThat(body).doesNotContainIgnoringCase(hash);
        }
        assertThat(body).doesNotContain("provider_subject").doesNotContain("providerSubject");
    }

    @Test
    void exportHoldsAPendingChangeOfAddressButNotItsToken() throws Exception {
        MockHttpSession session = signIn(requestLink("moving@example.com"));
        String hash = "a".repeat(64);
        jdbc.sql("INSERT INTO email_change_token (token_hash, account_id, new_email, expires_at) VALUES (?, ?, ?, ?)")
                .params(hash, accountOf("moving@example.com").toString(), "moved@example.com",
                        now().plusMinutes(15))
                .update();

        String body = mockMvc.perform(get("/api/account/export").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account.signIn.email").value("moving@example.com"))
                .andExpect(jsonPath("$.account.signIn.pendingEmail").value("moved@example.com"))
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain(hash);
    }

    @Test
    void exportLeavesOutThePendingAddressWhenNoChangeIsPending() throws Exception {
        MockHttpSession session = signIn(requestLink("staying@example.com"));

        mockMvc.perform(get("/api/account/export").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account.signIn.pendingEmail").doesNotExist());
    }

    @Test
    void providerAccountExportsOnlyTheMethod() throws Exception {
        UUID account = UUID.randomUUID();
        jdbc.sql("INSERT INTO account (id, provider, provider_subject, display_name, created_at, last_sign_in_at) "
                        + "VALUES (?, 'google', 'g-export-1', 'Google Otter 3', ?, ?)")
                .params(account.toString(), now(), now()).update();

        String body = mockMvc.perform(get("/api/account/export").with(oidcLogin()
                        .idToken(token -> token.subject("g-export-1"))
                        .clientRegistration(registrations.findByRegistrationId("google"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account.signIn.method").value("google"))
                .andExpect(jsonPath("$.account.signIn.email").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("g-export-1");
    }

    @Test
    void secondExportWithinAnHourIsRefused() throws Exception {
        MockHttpSession session = signIn(requestLink("twice-export@example.com"));
        mockMvc.perform(get("/api/account/export").session(session)).andExpect(status().isOk());

        mockMvc.perform(get("/api/account/export").session(session))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", matchesPattern("\\d+")))
                .andExpect(jsonPath("$.minutesLeft").value(60));
    }

    @Test
    void guestCannotExport() throws Exception {
        mockMvc.perform(get("/api/account/export")).andExpect(status().isUnauthorized());
    }

    @Test
    void attachmentIsNamedByDate() throws Exception {
        MockHttpSession session = signIn(requestLink("named@example.com"));

        mockMvc.perform(get("/api/account/export").session(session))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        matchesPattern("attachment; filename=\"beelot-data-\\d{4}-\\d{2}-\\d{2}\\.json\"")));
    }

    /** A won Contrée match at a private table: the account sits North, another account East, bots the rest. */
    private UUID recordMatch(UUID account, UUID other) {
        jdbc.sql("INSERT INTO account (id, provider, provider_subject, display_name, created_at, last_sign_in_at) "
                        + "VALUES (?, 'github', ?, 'Other Otter 7', ?, ?)")
                .params(other.toString(), other.toString(), now(), now()).update();
        UUID match = UUID.randomUUID();
        jdbc.sql("INSERT INTO match_record (id, ended_at, mode, variant, difficulty, north_south_score, "
                        + "east_west_score, winning_team) VALUES (?, ?, 'PRIVATE', 'CONTREE', NULL, 1010, 600, "
                        + "'NORTH_SOUTH')")
                .params(match.toString(), now()).update();
        seat(match, 0, account, "Swift Otter 42", "NORTH_SOUTH", false);
        seat(match, 1, other, "Other Otter 7", "EAST_WEST", false);
        seat(match, 2, null, "Camille", "NORTH_SOUTH", true);
        seat(match, 3, null, "Luc", "EAST_WEST", true);
        jdbc.sql("INSERT INTO match_round (match_id, round_index, declaring_team, trump, contract_value, coinched, "
                        + "contract_made, capot_team, belote_team, north_south_points, east_west_points) "
                        + "VALUES (?, 0, 'NORTH_SOUTH', 'HEARTS', 90, FALSE, TRUE, NULL, NULL, 92, 70)")
                .param(match.toString()).update();
        return match;
    }

    private void seat(UUID match, int position, UUID account, String name, String team, boolean bot) {
        jdbc.sql("INSERT INTO match_seat (match_id, position, account_id, name, team, bot) VALUES (?, ?, ?, ?, ?, ?)")
                .params(match.toString(), position, account == null ? null : account.toString(), name, team, bot)
                .update();
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
}
