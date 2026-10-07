package fr.beelot.application.history;

import fr.beelot.application.account.Account;
import fr.beelot.application.account.AccountService;
import fr.beelot.application.bot.BotGameService;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The match history on a MariaDB database migrated by Flyway. */
@SpringBootTest(properties = {
        "spring.security.oauth2.client.registration.github.client-id=test-client",
        "spring.security.oauth2.client.registration.github.client-secret=test-secret"})
@AutoConfigureMockMvc
@Testcontainers
class MatchHistoryIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MatchHistoryService history;

    @Autowired
    private MatchRecordRepository matches;

    @Autowired
    private AccountService accounts;

    @Autowired
    private BotGameService botGames;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ClientRegistrationRepository registrations;

    @Autowired
    private TransactionTemplate transactions;

    @Test
    void storesTheMatchWithItsSeatsAndRoundsAndNamesSeatsAfterTheirAccount() {
        Account chloeAccount = accounts.signIn("github", "301", Locale.ENGLISH);
        UUID chloe = chloeAccount.id();
        FinishedMatch match = match(chloe, List.of(
                round("North–South", 100, false, true, "", 20, 0),
                round("East–West", 160, true, false, "North–South", 520, 0)));

        history.record(match);

        transactions.executeWithoutResult(status -> {
            MatchRecord stored = matches.findById(match.id()).orElseThrow();
            assertEquals(FinishedMatch.Mode.SOLO, stored.mode());
            assertEquals("CONTREE", stored.variant());
            assertEquals("CHALLENGING", stored.difficulty());
            assertEquals(Team.NORTH_SOUTH, stored.winningTeam());
            assertEquals(List.of(chloeAccount.displayName(), "Camille", "Luc", "Manon"),
                    stored.seats().stream().map(SeatRecord::name).toList());
            assertEquals(List.of(Team.NORTH_SOUTH, Team.EAST_WEST, Team.NORTH_SOUTH, Team.EAST_WEST),
                    stored.seats().stream().map(SeatRecord::team).toList());
            assertEquals(chloe, stored.seats().getFirst().accountId());
            assertTrue(stored.seats().get(1).bot());
            RoundRecord first = stored.rounds().getFirst();
            assertEquals(Team.NORTH_SOUTH, first.declaringTeam());
            assertEquals("HEARTS", first.trump());
            assertEquals(100, first.contractValue());
            assertTrue(first.contractMade());
            assertEquals(Team.NORTH_SOUTH, first.beloteTeam());
            assertNull(first.capotTeam());
            RoundRecord second = stored.rounds().get(1);
            assertTrue(second.coinched());
            assertFalse(second.contractMade());
            assertEquals(Team.NORTH_SOUTH, second.capotTeam());
            assertEquals(520, second.northSouthPoints());
        });
    }

    @Test
    void storesAMatchOnce() {
        UUID dan = accounts.signIn("github", "302", Locale.ENGLISH).id();
        FinishedMatch match = match(dan, List.of(round("North–South", 80, false, true, "", 0, 0)));

        history.record(match);
        history.record(match);

        assertEquals(1, matches.findAll().stream().filter(stored -> stored.id().equals(match.id())).count());
    }

    @Test
    void doesNotStoreAMatchWithoutASignedInPlayer() {
        FinishedMatch match = match(null, List.of(round("North–South", 80, false, true, "", 0, 0)));

        history.record(match);

        assertFalse(matches.existsById(match.id()));
    }

    /** From the signed-in player's first request to the stored match. */
    @Test
    void aSignedInPlayersSoloMatchIsStoredWhenWon() throws Exception {
        DefaultOAuth2User eve = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"),
                Map.of("id", 303, "name", "Eve"), "id");
        Account eveAccount = accounts.signIn("github", "303", Locale.ENGLISH);
        UUID eveId = eveAccount.id();
        Cookie token = mockMvc.perform(get("/api/account")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        String response = mockMvc.perform(post("/api/bot-games")
                        .with(oauth2Login().oauth2User(eve)
                                .clientRegistration(registrations.findByRegistrationId("github")))
                        .cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json")
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID gameId = UUID.fromString(response.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1"));

        playMatch(gameId);

        transactions.executeWithoutResult(status -> {
            MatchRecord stored = matches.findAll().stream()
                    .filter(match -> eveId.equals(match.seats().getFirst().accountId())).findFirst().orElseThrow();
            assertEquals(eveAccount.displayName(), stored.seats().getFirst().name());
            assertEquals(FinishedMatch.Mode.SOLO, stored.mode());
            assertEquals(stored.northSouthScore(),
                    stored.rounds().stream().mapToInt(RoundRecord::northSouthPoints).sum());
        });
    }

    @Test
    void aGuestIsAskedToSignInToSeeStatistics() throws Exception {
        mockMvc.perform(get("/api/statistics"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Sign in to see your statistics."));
    }

    @Test
    void aPlayerSeesOnlyTheirOwnStatistics() throws Exception {
        DefaultOAuth2User finn = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"),
                Map.of("id", 304, "name", "Finn"), "id");
        UUID finnId = accounts.signIn("github", "304", Locale.ENGLISH).id();
        UUID gail = accounts.signIn("github", "305", Locale.ENGLISH).id();
        history.record(match(finnId, List.of(round("North–South", 100, false, true, "", 150, 12))));
        history.record(match(gail, List.of(round("North–South", 100, false, true, "", 150, 12))));

        mockMvc.perform(get("/api/statistics").with(oauth2Login().oauth2User(finn)
                        .clientRegistration(registrations.findByRegistrationId("github"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overall.played").value(1))
                .andExpect(jsonPath("$.overall.won").value(1))
                .andExpect(jsonPath("$.recentMatches[0].partner").value("Luc"))
                .andExpect(jsonPath("$.recentMatches[0].teamScore").value(1_010))
                .andExpect(jsonPath("$.contracts.taken").value(1))
                .andExpect(jsonPath("$.averagePointsPerRound").value(150.0));
    }

    private void playMatch(UUID gameId) {
        UUID humanId = botGames.get(gameId).seats().getFirst().playerId();
        for (int round = 1; !botGames.matchStatus(gameId).complete(); round++) {
            if (round > 20) fail("The match did not end after 20 rounds.");
            if (round > 1) botGames.nextRound(gameId);
            var bidding = botGames.bidding(gameId);
            for (int guard = 0; !bidding.complete(); guard++) {
                if (guard > 20) fail("The auction did not complete.");
                bidding = bidding.highestBid() < 160 ? botGames.bid(gameId, 160, GameCard.Suit.SPADES)
                        : botGames.pass(gameId);
            }
            var board = botGames.board(gameId).viewFor(humanId);
            for (int guard = 0; board.roundResult() == null; guard++) {
                if (guard > 40) fail("The round did not finish.");
                if (board.reviewingCompletedTrick()) botGames.continueAfterTrick(gameId);
                else botGames.play(gameId, board.legalCards().getFirst());
                board = botGames.board(gameId).viewFor(humanId);
            }
        }
    }

    private static FinishedMatch match(UUID accountId, List<GameBoard.RoundSummary> rounds) {
        return new FinishedMatch(UUID.randomUUID(), Instant.now(), FinishedMatch.Mode.SOLO, GameVariant.CONTREE,
                fr.beelot.game.BotDifficulty.CHALLENGING, 1_010, 600, "North–South",
                List.of(new FinishedMatch.Seat(accountId, "You", false), new FinishedMatch.Seat(null, "Camille", true),
                        new FinishedMatch.Seat(null, "Luc", true), new FinishedMatch.Seat(null, "Manon", true)),
                rounds);
    }

    private static GameBoard.RoundSummary round(String declaringTeam, int contract, boolean coinched, boolean made,
                                                String capotTeam, int northSouth, int eastWest) {
        return new GameBoard.RoundSummary(declaringTeam, GameCard.Suit.HEARTS, contract, coinched,
                new GameBoard.RoundResult(100, 62, 10, 0, 20, 0, made, northSouth, eastWest, capotTeam));
    }
}
