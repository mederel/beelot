package com.beelot.application.privategame;

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

    @Test
    void fourPlayersCanStartAndCoincheAPrivateContreeContract() throws Exception {
        Session owner = createContreeTable("Ana");
        Session second = join(owner, "Benoit");
        Session third = join(owner, "Chloe");
        Session fourth = join(owner, "David");
        for (Session session : java.util.List.of(owner, second, third, fourth)) ready(session);

        mockMvc.perform(post("/api/private-tables/{tableId}/start", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        mockMvc.perform(get("/api/private-tables/{tableId}/bidding", owner.tableId())
                        .queryParam("playerToken", owner.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.variant").value("CONTREE"))
                .andExpect(jsonPath("$.hand.length()").value(8));

        mockMvc.perform(post("/api/private-tables/{tableId}/bids/contract", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + owner.token() + "\",\"value\":90,\"suit\":\"HEARTS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.highestBid").value(90));

        mockMvc.perform(post("/api/private-tables/{tableId}/bids/coinche", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(second)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(true));

        String board = mockMvc.perform(get("/api/private-tables/{tableId}/board", owner.tableId())
                        .queryParam("playerToken", owner.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contractValue").value(90))
                .andExpect(jsonPath("$.trump").value("Hearts"))
                .andExpect(jsonPath("$.coinched").value(true))
                .andExpect(jsonPath("$.hand.length()").value(8))
                .andExpect(jsonPath("$.currentPlayer").value("Ana"))
                .andExpect(jsonPath("$.currentPlayerIndex").value(0))
                .andReturn().getResponse().getContentAsString();

        String rank = com.jayway.jsonpath.JsonPath.read(board, "$.legalCards[0].rank");
        String suit = com.jayway.jsonpath.JsonPath.read(board, "$.legalCards[0].suit");
        mockMvc.perform(post("/api/private-tables/{tableId}/cards", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + owner.token() + "\",\"rank\":\"" + rank
                                + "\",\"suit\":\"" + suit + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hand.length()").value(7))
                .andExpect(jsonPath("$.currentTrick.length()").value(1))
                .andExpect(jsonPath("$.activePlayer").value("Benoit"));
    }

    @Test
    void privateAuctionRejectsATokenFromAnotherTable() throws Exception {
        Session table = createContreeTable("Ana");
        Session outsider = createContreeTable("Eve");

        mockMvc.perform(get("/api/private-tables/{tableId}/bidding", table.tableId())
                        .queryParam("playerToken", outsider.token()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("You are not authorized for this table."));
    }

    private Session createContreeTable(String name) throws Exception {
        String response = mockMvc.perform(post("/api/private-tables")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerName\":\"" + name + "\",\"variant\":\"CONTREE\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return sessionFrom(response);
    }

    private Session join(Session owner, String name) throws Exception {
        String response = mockMvc.perform(post("/api/private-tables/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"invitationCode\":\"" + owner.invitationCode() + "\",\"playerName\":\"" + name + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return sessionFrom(response);
    }

    private void ready(Session session) throws Exception {
        mockMvc.perform(post("/api/private-tables/{tableId}/ready", session.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + session.token() + "\",\"ready\":true}"))
                .andExpect(status().isOk());
    }

    private Session sessionFrom(String response) {
        return new Session(com.jayway.jsonpath.JsonPath.read(response, "$.table.id"),
                com.jayway.jsonpath.JsonPath.read(response, "$.table.invitationCode"),
                com.jayway.jsonpath.JsonPath.read(response, "$.playerToken"));
    }

    private String tokenBody(Session session) {
        return "{\"playerToken\":\"" + session.token() + "\"}";
    }

    private record Session(String tableId, String invitationCode, String token) {
    }
}
