package com.beelot.application.privategame;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PrivateTableController.class)
@Import(PrivateTableService.class)
class PrivateTableControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void createsAWaitingTableWithAnInvitationCodeAndOwnerSeat() throws Exception {
        mockMvc.perform(post("/api/private-tables")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerName\":\"Ana\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.table.invitationCode").isString())
                .andExpect(jsonPath("$.table.invitationCode").value(org.hamcrest.Matchers.matchesPattern("[A-Z2-9]{6}")))
                .andExpect(jsonPath("$.table.status").value("WAITING_FOR_PLAYERS"))
                .andExpect(jsonPath("$.table.seats.length()").value(1))
                .andExpect(jsonPath("$.table.seats[0].name").value("Ana"));
    }

    @Test
    void createsAContreePrivateTable() throws Exception {
        mockMvc.perform(post("/api/private-tables")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerName\":\"Ana\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.table.variant").value("CONTREE"))
                .andExpect(jsonPath("$.table.variantLabel").value("Contrée"));
    }
}
