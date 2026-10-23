package fr.beelot.application.bot;

import fr.beelot.application.WebSliceTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.fail;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(value = BotGameController.class, properties = "beelot.security.rate-limit.creations-per-window=1000")
@Import({BotGameService.class, WebSliceTestConfiguration.class})
class BotGameControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void createsAPassAndPlayGameWithBotsInTheEmptySeats() throws Exception {
        mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\","
                                + "\"seats\":[\"Ana\",\"\",\"Ben\",null]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.passAndPlay").value(true))
                .andExpect(jsonPath("$.seats[0].name").value("Ana"))
                .andExpect(jsonPath("$.seats[0].type").value("HUMAN"))
                .andExpect(jsonPath("$.seats[1].type").value("BOT"))
                .andExpect(jsonPath("$.seats[2].name").value("Ben"))
                .andExpect(jsonPath("$.seats[3].type").value("BOT"));
    }

    @Test
    void rejectsPassAndPlayWithASinglePlayer() throws Exception {
        mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"seats\":[\"Ana\",\"\",\"\",\"\"]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Pass and play needs at least two players."));
    }

    @Test
    void createsFourSeatGameAtTheSelectedDifficulty() throws Exception {
        mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"CHALLENGING\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.difficulty").value("CHALLENGING"))
                .andExpect(jsonPath("$.difficultyLabel").value("Challenging"))
                .andExpect(jsonPath("$.seats.length()").value(4))
                .andExpect(jsonPath("$.seats[0].type").value("HUMAN"))
                .andExpect(jsonPath("$.seats[1].type").value("BOT"))
                .andExpect(jsonPath("$.seats[2].type").value("BOT"))
                .andExpect(jsonPath("$.seats[3].type").value("BOT"));
    }

    @Test
    void createsAContreeGameWhenTheVariantIsSelected() throws Exception {
        mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.variant").value("CONTREE"))
                .andExpect(jsonPath("$.variantLabel").value("Contrée"));
    }

    @Test
    void startsAContreeBoardFromAnAscendingContractBid() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(get("/api/bot-games/{gameId}/bidding", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variant").value("CONTREE"))
                .andExpect(jsonPath("$.hand.length()").value(8))
                .andExpect(jsonPath("$.upturnedCard").doesNotExist());

        mockMvc.perform(post("/api/bot-games/{gameId}/bids/contract", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":160,\"suit\":\"SPADES\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(true))
                .andExpect(jsonPath("$.highestBid").value(160));

        mockMvc.perform(get("/api/bot-games/{gameId}/board", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variant").value("CONTREE"))
                .andExpect(jsonPath("$.contractValue").value(160))
                .andExpect(jsonPath("$.trump").value("Spades"))
                // A bot holding a strong announcement may coinche the 160 (US-061).
                .andExpect(jsonPath("$.coinched").isBoolean())
                .andExpect(jsonPath("$.currentPlayer").value("You"))
                .andExpect(jsonPath("$.currentPlayerIndex").value(0))
                .andExpect(jsonPath("$.activePlayerIndex").value(0));
    }

    @Test
    void letsTheHumanCoincheABotContract() throws Exception {
        for (int attempt = 0; attempt < 100; attempt++) {
            String gameId = createContreeGame();
            String bidding = mockMvc.perform(post("/api/bot-games/{gameId}/bids/pass", gameId))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            // Bots only open with a strong enough hand; retry the deals where no opponent's contract can be coinched,
            // and those redealt because everyone passed: the next dealer's bots then bid before the human.
            if (!com.jayway.jsonpath.JsonPath.<Boolean>read(bidding, "$.coincheAllowed")
                    || com.jayway.jsonpath.JsonPath.<Integer>read(bidding, "$.dealerIndex") != 3) continue;
            assertEquals("Pass", com.jayway.jsonpath.JsonPath.read(bidding, "$.calls[0].call"));
            int contract = com.jayway.jsonpath.JsonPath.read(bidding, "$.highestBid");

            mockMvc.perform(post("/api/bot-games/{gameId}/bids/coinche", gameId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.contractValue").value(contract))
                    .andExpect(jsonPath("$.coinched").value(true));
            return;
        }
        fail("No bot opened a contract the human could coinche.");
    }

    @Test
    void targetDefaultsToOneThousand() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(get("/api/bot-games/{gameId}", gameId)).andExpect(jsonPath("$.target").value(1000));
        mockMvc.perform(get("/api/bot-games/{gameId}/match", gameId)).andExpect(jsonPath("$.target").value(1000));
    }

    @Test
    void chosenTargetIsReturned() throws Exception {
        String body = mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\",\"target\":1500}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.target").value(1500))
                .andReturn().getResponse().getContentAsString();
        String gameId = com.jayway.jsonpath.JsonPath.read(body, "$.id");
        mockMvc.perform(get("/api/bot-games/{gameId}/match", gameId)).andExpect(jsonPath("$.target").value(1500));
    }

    @Test
    void anInvalidTargetIsABadRequest() throws Exception {
        mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\",\"target\":750}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The match target must be 500, 1,000, 1,500 or 2,000 points."));
    }

    @Test
    void announcementsAreOnByDefault() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(get("/api/bot-games/{gameId}", gameId)).andExpect(jsonPath("$.announcements").value(true));
        startContract(gameId);
        mockMvc.perform(get("/api/bot-games/{gameId}/board", gameId))
                .andExpect(jsonPath("$.announcements").value(true))
                .andExpect(jsonPath("$.ownAnnouncements").isArray())
                .andExpect(jsonPath("$.declarers").isArray())
                .andExpect(jsonPath("$.revealedAnnouncements").isArray());
    }

    @Test
    void announcementsCanBeTurnedOff() throws Exception {
        String body = mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\",\"announcements\":false}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.announcements").value(false))
                .andReturn().getResponse().getContentAsString();
        String gameId = com.jayway.jsonpath.JsonPath.read(body, "$.id");

        startContract(gameId);
        mockMvc.perform(get("/api/bot-games/{gameId}/board", gameId))
                .andExpect(jsonPath("$.announcements").value(false))
                .andExpect(jsonPath("$.ownAnnouncements").isEmpty());
    }

    @Test
    void declareIsAcceptedOnACardPlay() throws Exception {
        String gameId = createContreeGame();
        startContract(gameId);
        String board = mockMvc.perform(get("/api/bot-games/{gameId}/board", gameId))
                .andReturn().getResponse().getContentAsString();
        String rank = com.jayway.jsonpath.JsonPath.read(board, "$.legalCards[0].rank");
        String suit = com.jayway.jsonpath.JsonPath.read(board, "$.legalCards[0].suit");

        mockMvc.perform(post("/api/bot-games/{gameId}/cards", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rank\":\"" + rank + "\",\"suit\":\"" + suit + "\",\"declare\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ownAnnouncements").isEmpty());
    }

    /** The human bids 160 spades, which the bots never overcall, so the card play starts with the human's lead. */
    private void startContract(String gameId) throws Exception {
        mockMvc.perform(post("/api/bot-games/{gameId}/bids/contract", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":160,\"suit\":\"SPADES\"}"))
                .andExpect(jsonPath("$.complete").value(true));
    }

    @Test
    void rejectsAContractWithoutATrumpSuit() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(post("/api/bot-games/{gameId}/bids/contract", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":80}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Choose a trump suit for the contract."));
    }

    @Test
    void returnsAnExistingGame() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(get("/api/bot-games/{gameId}", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(gameId))
                .andExpect(jsonPath("$.variant").value("CONTREE"))
                .andExpect(jsonPath("$.passAndPlay").value(false));
    }

    @Test
    void answersNotFoundForAnUnknownGame() throws Exception {
        String unknown = "00000000-0000-0000-0000-000000000000";

        mockMvc.perform(get("/api/bot-games/{gameId}", unknown))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/bot-games/{gameId}/bidding", unknown))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/bot-games/{gameId}/bids/pass", unknown))
                .andExpect(status().isNotFound());
    }

    @Test
    void startsTheMatchScoreAtZero() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(get("/api/bot-games/{gameId}/match", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.northSouth").value(0))
                .andExpect(jsonPath("$.eastWest").value(0))
                .andExpect(jsonPath("$.complete").value(false));
    }

    @Test
    void playsALegalCardFromTheHumanHand() throws Exception {
        String gameId = createContreeGame();
        mockMvc.perform(post("/api/bot-games/{gameId}/bids/contract", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":160,\"suit\":\"SPADES\"}"))
                .andExpect(status().isOk());
        String board = mockMvc.perform(get("/api/bot-games/{gameId}/board", gameId))
                .andReturn().getResponse().getContentAsString();
        String rank = com.jayway.jsonpath.JsonPath.read(board, "$.legalCards[0].rank");
        String suit = com.jayway.jsonpath.JsonPath.read(board, "$.legalCards[0].suit");

        mockMvc.perform(post("/api/bot-games/{gameId}/cards", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rank\":\"" + rank + "\",\"suit\":\"" + suit + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hand.length()").value(7))
                .andExpect(jsonPath("$.currentTrick[0].rank").value(rank))
                .andExpect(jsonPath("$.currentTrick[0].suit").value(suit));
    }

    @Test
    void dealsTheNextRoundWithTheDealerMovedOneSeat() throws Exception {
        String gameId = createContreeGame();
        String bidding = mockMvc.perform(get("/api/bot-games/{gameId}/bidding", gameId))
                .andReturn().getResponse().getContentAsString();
        int dealer = com.jayway.jsonpath.JsonPath.read(bidding, "$.dealerIndex");

        mockMvc.perform(post("/api/bot-games/{gameId}/rounds/next", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dealerIndex").value((dealer + 1) % 4))
                .andExpect(jsonPath("$.hand.length()").value(8))
                .andExpect(jsonPath("$.complete").value(false));
    }

    @Test
    void rematchResetsTheMatchScore() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(post("/api/bot-games/{gameId}/rematch", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hand.length()").value(8));
        mockMvc.perform(get("/api/bot-games/{gameId}/match", gameId))
                .andExpect(jsonPath("$.northSouth").value(0))
                .andExpect(jsonPath("$.eastWest").value(0))
                .andExpect(jsonPath("$.complete").value(false));
    }

    @Test
    void allTrumpsDefaultsToOn() throws Exception {
        mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.allTrumps").value(true));
        mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\",\"allTrumps\":false}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.allTrumps").value(false));
    }

    @Test
    void bidsAllTrumps() throws Exception {
        String gameId = createContreeGame();
        mockMvc.perform(post("/api/bot-games/{gameId}/bids/contract", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":100,\"suit\":\"ALL_TRUMPS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.highestBidSuit").value("ALL_TRUMPS"));

        String otherGame = createContreeGame();
        mockMvc.perform(post("/api/bot-games/{gameId}/bids/contract", otherGame)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":100,\"suit\":\"HEARTS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.highestBidSuit").value("HEARTS"));
    }

    @Test
    void aNewContractIsRefusedWhenOff() throws Exception {
        String body = mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\",\"allTrumps\":false}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String gameId = com.jayway.jsonpath.JsonPath.read(body, "$.id");

        mockMvc.perform(post("/api/bot-games/{gameId}/bids/contract", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":100,\"suit\":\"NO_TRUMPS\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Tout-atout and sans-atout are not played at this table."));
    }

    private String createContreeGame() throws Exception {
        String body = mockMvc.perform(post("/api/bot-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(body, "$.id");
    }
}
