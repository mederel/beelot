package com.beelot.application.ai;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AiGameController.class)
@Import(AiGameService.class)
class AiGameControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void createsFourSeatGameAtTheSelectedDifficulty() throws Exception {
        mockMvc.perform(post("/api/ai-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"CHALLENGING\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.difficulty").value("CHALLENGING"))
                .andExpect(jsonPath("$.difficultyLabel").value("Challenging"))
                .andExpect(jsonPath("$.seats.length()").value(4))
                .andExpect(jsonPath("$.seats[0].type").value("HUMAN"))
                .andExpect(jsonPath("$.seats[1].type").value("AI"))
                .andExpect(jsonPath("$.seats[2].type").value("AI"))
                .andExpect(jsonPath("$.seats[3].type").value("AI"));
    }

    @Test
    void createsAContreeGameWhenTheVariantIsSelected() throws Exception {
        mockMvc.perform(post("/api/ai-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.variant").value("CONTREE"))
                .andExpect(jsonPath("$.variantLabel").value("Contrée"));
    }

    @Test
    void startsAContreeBoardFromAnAscendingContractBid() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(get("/api/ai-games/{gameId}/bidding", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variant").value("CONTREE"))
                .andExpect(jsonPath("$.hand.length()").value(8))
                .andExpect(jsonPath("$.upturnedCard").doesNotExist());

        mockMvc.perform(post("/api/ai-games/{gameId}/bids/contract", gameId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":100,\"suit\":\"SPADES\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variant").value("CONTREE"))
                .andExpect(jsonPath("$.contractValue").value(100))
                .andExpect(jsonPath("$.trump").value("Spades"))
                .andExpect(jsonPath("$.coinched").value(false));
    }

    @Test
    void letsTheHumanCoincheAnAiContract() throws Exception {
        String gameId = createContreeGame();

        mockMvc.perform(post("/api/ai-games/{gameId}/bids/pass", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.highestBid").value(80))
                .andExpect(jsonPath("$.coincheAllowed").value(true));

        mockMvc.perform(post("/api/ai-games/{gameId}/bids/coinche", gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contractValue").value(80))
                .andExpect(jsonPath("$.coinched").value(true));
    }

    private String createContreeGame() throws Exception {
        String body = mockMvc.perform(post("/api/ai-games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"difficulty\":\"RELAXED\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(body, "$.id");
    }
}
