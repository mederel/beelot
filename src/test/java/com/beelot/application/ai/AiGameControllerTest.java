package com.beelot.application.ai;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
}
