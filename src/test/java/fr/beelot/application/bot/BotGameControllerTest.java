package fr.beelot.application.bot;

import fr.beelot.application.WebSecurityTestConfiguration;
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

@WebMvcTest(BotGameController.class)
@Import({BotGameService.class, WebSecurityTestConfiguration.class})
class BotGameControllerTest {

    @Autowired
    private MockMvc mockMvc;

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
                .andExpect(jsonPath("$.coinched").value(false))
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
            // including those redealt because everyone passed.
            if (!com.jayway.jsonpath.JsonPath.<Boolean>read(bidding, "$.coincheAllowed")) continue;
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
    void rejectsAContractWithoutATrumpSuit() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(post("/api/bot-games/{gameId}/bids/contract", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":80}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Choose a trump suit for the contract."));
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
