package fr.beelot.application.privacy;

import fr.beelot.application.account.AccountService;
import fr.beelot.application.account.PasskeySignIn;
import fr.beelot.application.account.SoftwarePasskey;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;
import java.util.Locale;

import static fr.beelot.application.account.BrowserCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Downloading one's data (US-082), end to end, on a MariaDB database migrated by Flyway.
 */
@SpringBootTest(properties = {"beelot.public-url=http://localhost", "beelot.passkey.limit-per-ip=1000"})
@AutoConfigureMockMvc
@Testcontainers
class DataExportIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:12.3");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private AccountService accounts;

    @Test
    void exportHoldsAccountEventsAndMatches() throws Exception {
        UUID account = newAccount();
        jdbc.sql("INSERT INTO security_event (account_id, type, outcome, ip_address, occurred_at) "
                + "VALUES (?, 'SIGN_IN', 'SUCCESS', '127.0.0.1', ?)").params(account.toString(), now()).update();
        UUID match = recordMatch(account, newAccount());

        mockMvc.perform(get("/api/account/export").with(PasskeySignIn.as(account)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.format").value("beelot-export-2"))
                .andExpect(jsonPath("$.exportedAt").isNotEmpty())
                .andExpect(jsonPath("$.account.id").value(account.toString()))
                .andExpect(jsonPath("$.account.displayName").isNotEmpty())
                .andExpect(jsonPath("$.account.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.account.lastSignInAt").isNotEmpty())
                // Empty until the second sign-in (US-077).
                .andExpect(jsonPath("$.account.previousSignInAt").hasJsonPath())
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
                .andExpect(jsonPath("$.matches[0].rounds[0].capotTeam").value(nullValue()))
                // Rows inserted without the US-060, US-062 and US-063 columns take their defaults.
                .andExpect(jsonPath("$.matches[0].announcements").value(false))
                .andExpect(jsonPath("$.matches[0].target").value(1000))
                .andExpect(jsonPath("$.matches[0].allTrumps").value(false))
                .andExpect(jsonPath("$.matches[0].rounds[0].northSouthAnnouncements").value(0))
                .andExpect(jsonPath("$.matches[0].rounds[0].eastWestAnnouncements").value(0));
        assertThat(match).isNotNull();
    }

    @Test
    void exportCarriesTheMatchTarget() throws Exception {
        UUID account = newAccount();
        UUID match = recordMatch(account, newAccount());
        jdbc.sql("UPDATE match_record SET target = 500 WHERE id = ?").param(match.toString()).update();

        mockMvc.perform(get("/api/account/export").with(PasskeySignIn.as(account)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.format").value("beelot-export-2"))
                .andExpect(jsonPath("$.matches[0].target").value(500));
    }

    @Test
    void exportCarriesAllTrumpsAndTheNoTrumpsRound() throws Exception {
        UUID account = newAccount();
        UUID match = recordMatch(account, newAccount());
        jdbc.sql("UPDATE match_record SET all_trumps = TRUE WHERE id = ?").param(match.toString()).update();
        jdbc.sql("INSERT INTO match_round (match_id, round_index, declaring_team, trump, contract_value, coinched, "
                        + "contract_made, capot_team, belote_team, north_south_points, east_west_points) "
                        + "VALUES (?, 1, 'EAST_WEST', 'NO_TRUMPS', 100, FALSE, TRUE, NULL, NULL, 40, 120)")
                .param(match.toString()).update();

        mockMvc.perform(get("/api/account/export").with(PasskeySignIn.as(account)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.format").value("beelot-export-2"))
                .andExpect(jsonPath("$.matches[0].allTrumps").value(true))
                .andExpect(jsonPath("$.matches[0].rounds[1].trump").value("NO_TRUMPS"));
    }

    @Test
    void exportHoldsNoAccountIdsOfOthersAndNoCredentials() throws Exception {
        UUID account = newAccount();
        UUID other = newAccount();
        recordMatch(account, other);

        String body = mockMvc.perform(get("/api/account/export").with(PasskeySignIn.as(account)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain(other.toString());
        assertThat(body).doesNotContain("credential").doesNotContain("publicKey");
    }

    @Test
    void exportShowsThePasskeyDatesOnly() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String options = mockMvc.perform(post("/api/sign-up/options").param("language", "en").session(session)
                .with(csrfToken())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        mockMvc.perform(post("/api/sign-up").contentType(MediaType.APPLICATION_JSON)
                        .content(new SoftwarePasskey().register(options)).session(session).with(csrfToken()))
                .andExpect(status().isNoContent());
        String credentialId = jdbc.sql("SELECT credential_id FROM user_credentials").query(String.class).single();
        byte[] publicKey = jdbc.sql("SELECT public_key FROM user_credentials").query(byte[].class).single();

        String body = mockMvc.perform(get("/api/account/export").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.format").value("beelot-export-2"))
                .andExpect(jsonPath("$.account.passkey.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.account.passkey.lastUsedAt").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        byte[] rawId = Base64.getUrlDecoder().decode(credentialId);
        assertThat(body).doesNotContain(credentialId)
                .doesNotContain(Base64.getEncoder().withoutPadding().encodeToString(rawId))
                .doesNotContain(Base64.getEncoder().withoutPadding().encodeToString(publicKey))
                .doesNotContain(Base64.getUrlEncoder().withoutPadding().encodeToString(publicKey))
                .doesNotContainIgnoringCase("email");
    }

    @Test
    void secondExportWithinAnHourIsRefused() throws Exception {
        UUID account = newAccount();
        mockMvc.perform(get("/api/account/export").with(PasskeySignIn.as(account))).andExpect(status().isOk());

        mockMvc.perform(get("/api/account/export").with(PasskeySignIn.as(account)))
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
        UUID account = newAccount();

        mockMvc.perform(get("/api/account/export").with(PasskeySignIn.as(account)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        matchesPattern("attachment; filename=\"beelot-data-\\d{4}-\\d{2}-\\d{2}\\.json\"")));
    }

    /** A won Contrée match at a private table: the account sits North, another account East, bots the rest. */
    private UUID recordMatch(UUID account, UUID other) {
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

    private UUID newAccount() {
        return accounts.create(Locale.ENGLISH).id();
    }

    private static LocalDateTime now() {
        return LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
    }
}
