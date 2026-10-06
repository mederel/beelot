package fr.beelot.application.matchmaking;

import fr.beelot.application.WebSliceTestConfiguration;
import fr.beelot.application.privategame.PrivateTableService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MatchmakingController.class)
@Import({PrivateTableService.class, MatchmakingService.class, WebSliceTestConfiguration.class})
class MatchmakingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void quickMatchSeatsThePlayerAtAPublicTable() throws Exception {
        mockMvc.perform(post("/api/matchmaking/quick-match")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerName\":\"Ana\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.table.publicTable").value(true))
                .andExpect(jsonPath("$.table.invitationCode").doesNotExist())
                .andExpect(jsonPath("$.table.botFillAt").isString())
                .andExpect(jsonPath("$.table.variant").value("CONTREE"))
                .andExpect(jsonPath("$.table.seats.length()").value(1))
                .andExpect(jsonPath("$.playerToken").isString());
    }

    @Test
    void blankNameIsAConflict() throws Exception {
        mockMvc.perform(post("/api/matchmaking/quick-match")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerName\":\" \"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Enter a player name."));
    }
}
