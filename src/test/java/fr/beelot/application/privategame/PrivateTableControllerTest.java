package fr.beelot.application.privategame;

import fr.beelot.application.WebSliceTestConfiguration;
import fr.beelot.game.GameVariant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PrivateTableController.class,
        properties = "beelot.security.rate-limit.creations-per-window=1000")
@Import({PrivateTableService.class, WebSliceTestConfiguration.class})
class PrivateTableControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PrivateTableService privateTableService;

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
                .andExpect(jsonPath("$.highestBid").value(90))
                .andExpect(jsonPath("$.calls[0].call").value("90 Hearts"))
                .andExpect(jsonPath("$.auctionId").isNotEmpty())
                .andExpect(jsonPath("$.auction[0].call").value("90 Hearts"));

        mockMvc.perform(post("/api/private-tables/{tableId}/bids/coinche", owner.tableId())
                .contentType(MediaType.APPLICATION_JSON)
                .content(tokenBody(second)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(true))
                .andExpect(jsonPath("$.calls[1].call").value("Coinche!"));

        String board = mockMvc.perform(get("/api/private-tables/{tableId}/board", owner.tableId())
                        .queryParam("playerToken", owner.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contractValue").value(90))
                .andExpect(jsonPath("$.trump").value("Hearts"))
                .andExpect(jsonPath("$.coinched").value(true))
                .andExpect(jsonPath("$.hand.length()").value(8))
                .andExpect(jsonPath("$.currentPlayer").value("Ana"))
                .andExpect(jsonPath("$.currentPlayerIndex").value(0))
                .andExpect(jsonPath("$.activePlayerIndex").value(0))
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
                .andExpect(jsonPath("$.activePlayer").value("Benoit"))
                .andExpect(jsonPath("$.activePlayerIndex").value(1));
    }

    @Test
    void ownerCanStartWithBotsWithoutWaitingForAFullTable() throws Exception {
        Session owner = createContreeTable("Ana");
        ready(owner);

        mockMvc.perform(post("/api/private-tables/{tableId}/start-with-bots", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.seats.length()").value(4))
                .andExpect(jsonPath("$.seats[1].connectionState").value("BOT_TAKEOVER"))
                .andExpect(jsonPath("$.seats[1].ready").value(true));

        mockMvc.perform(get("/api/private-tables/{tableId}/bidding", owner.tableId())
                        .queryParam("playerToken", owner.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playerTurn").value(true));
    }

    @Test
    void aPlayerSendsAReactionThatTheTableLists() throws Exception {
        Session owner = createContreeTable("Ana");
        ready(owner);
        mockMvc.perform(post("/api/private-tables/{tableId}/start-with-bots", owner.tableId())
                .contentType(MediaType.APPLICATION_JSON).content(tokenBody(owner))).andExpect(status().isOk());

        mockMvc.perform(post("/api/private-tables/{tableId}/reactions", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + owner.token() + "\",\"reaction\":\"GOOD_GAME\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.position").value(0))
                .andExpect(jsonPath("$.reaction").value("GOOD_GAME"));

        mockMvc.perform(get("/api/private-tables/{tableId}/reactions", owner.tableId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].reaction").value("GOOD_GAME"))
                .andExpect(jsonPath("$[0].sequence").isNumber());
    }

    @Test
    void aPlayerMovesToAnEmptySeat() throws Exception {
        Session owner = createContreeTable("Ana");
        Session guest = join(owner, "Benoit");

        mockMvc.perform(post("/api/private-tables/{tableId}/seat", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + guest.token() + "\",\"position\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.seats[0].position").value(0))
                .andExpect(jsonPath("$.seats[1].name").value("Benoit"))
                .andExpect(jsonPath("$.seats[1].position").value(2));

        mockMvc.perform(post("/api/private-tables/{tableId}/seat", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + owner.token() + "\",\"position\":2}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("That seat is taken."));
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

    @Test
    void waitingPlayerCanLeave() throws Exception {
        Session owner = createContreeTable("Ana");
        Session second = join(owner, "Benoit");

        mockMvc.perform(post("/api/private-tables/{tableId}/leave", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(second)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.seats.length()").value(1))
                .andExpect(jsonPath("$.seats[0].name").value("Ana"));
    }

    @Test
    void lastPlayerLeavingRemovesTheTable() throws Exception {
        Session owner = createContreeTable("Ana");

        mockMvc.perform(post("/api/private-tables/{tableId}/leave", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(owner)))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/private-tables/{tableId}", owner.tableId()))
                .andExpect(status().isConflict());
    }

    @Test
    void privateTableIsNotPublic() throws Exception {
        Session owner = createContreeTable("Ana");

        mockMvc.perform(get("/api/private-tables/{tableId}", owner.tableId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publicTable").value(false))
                .andExpect(jsonPath("$.botFillAt").doesNotExist());
    }

    @Test
    void theOwnerSetsATurnTimerAndAPlayerReconnectsAfterADisconnection() throws Exception {
        Session owner = createTable("Ana", "CLASSIC");
        Session guest = join(owner, "Ben");

        mockMvc.perform(post("/api/private-tables/{tableId}/turn-timer", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + owner.token() + "\",\"seconds\":30}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.turnTimerSeconds").value(30));
        mockMvc.perform(post("/api/private-tables/{tableId}/turn-timer", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + guest.token() + "\",\"seconds\":60}"))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/private-tables/{tableId}/disconnect", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(guest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.seats[1].connectionState").value("DISCONNECTED"));
        mockMvc.perform(post("/api/private-tables/{tableId}/reconnect", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(guest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playerToken").value(guest.token()))
                .andExpect(jsonPath("$.table.seats[1].connectionState").value("CONNECTED"));
    }

    @Test
    void ownerTurnsAnnouncementsOff() throws Exception {
        Session owner = createContreeTable("Ana");

        mockMvc.perform(get("/api/private-tables/{tableId}", owner.tableId()))
                .andExpect(jsonPath("$.announcements").value(true));
        setAnnouncements(owner, false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcements").value(false));
    }

    @Test
    void ownerChangesTheTarget() throws Exception {
        Session owner = createContreeTable("Ana");
        Session guest = join(owner, "Ben");

        mockMvc.perform(get("/api/private-tables/{tableId}", owner.tableId())).andExpect(jsonPath("$.target").value(1000));
        setTarget(owner, 500).andExpect(status().isOk()).andExpect(jsonPath("$.target").value(500));
        setTarget(guest, 1500)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Only the table owner can change the match target."));
        setTarget(owner, 750)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The match target must be 500, 1,000, 1,500 or 2,000 points."));
    }

    @Test
    void publicTablesKeepTheirTarget() throws Exception {
        PrivateTableService.PrivateTableAccess access = privateTableService.openPublic("Ana", GameVariant.CLASSIC);

        setTarget(new Session(access.table().id().toString(), null, access.token().toString()), 500)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Public tables always play to 1,000 points."));
    }

    @Test
    void otherPlayerCannotChangeAnnouncements() throws Exception {
        Session owner = createContreeTable("Ana");
        Session guest = join(owner, "Ben");

        setAnnouncements(guest, false)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Only the table owner can change announcements."));
    }

    @Test
    void announcementsCannotChangeAfterTheStart() throws Exception {
        Session owner = startClassicTableWithBots();

        setAnnouncements(owner, false)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Announcements cannot change after the game starts."));
    }

    @Test
    void theStartedTablePlaysWithTheOwnersChoice() throws Exception {
        Session owner = createContreeTable("Ana");
        setAnnouncements(owner, false).andExpect(status().isOk());
        ready(owner);
        mockMvc.perform(post("/api/private-tables/{tableId}/start-with-bots", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(owner)))
                .andExpect(status().isOk());

        // The owner bids first; 160 is the highest bid, so the auction ends with it.
        mockMvc.perform(post("/api/private-tables/{tableId}/bids/contract", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + owner.token() + "\",\"value\":160,\"suit\":\"SPADES\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/private-tables/{tableId}/board", owner.tableId())
                        .queryParam("playerToken", owner.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcements").value(false))
                .andExpect(jsonPath("$.ownAnnouncements").isEmpty());
    }

    @Test
    void aPlayerPassesInAClassicAuction() throws Exception {
        Session owner = startClassicTableWithBots();

        mockMvc.perform(post("/api/private-tables/{tableId}/bids/pass", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.auction[0].call").value("Pass"));
    }

    /** A player takes the upturned suit, plays the round out against bots, then deals the next round. */
    @Test
    void aClassicRoundIsPlayedThroughToTheNextDeal() throws Exception {
        Session owner = startClassicTableWithBots();
        String bidding = mockMvc.perform(get("/api/private-tables/{tableId}/bidding", owner.tableId())
                        .queryParam("playerToken", owner.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upturnedCard.suit").exists())
                .andReturn().getResponse().getContentAsString();
        String upturned = com.jayway.jsonpath.JsonPath.read(bidding, "$.upturnedCard.suit");
        String firstAuction = com.jayway.jsonpath.JsonPath.read(bidding, "$.auctionId");

        mockMvc.perform(post("/api/private-tables/{tableId}/bids/trump", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerToken\":\"" + owner.token() + "\",\"suit\":\"" + upturned + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hand.length()").value(8));

        for (int step = 0; ; step++) {
            assertThat(step).as("the round ends").isLessThan(100);
            String board = mockMvc.perform(get("/api/private-tables/{tableId}/board", owner.tableId())
                            .queryParam("playerToken", owner.token()))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            if (com.jayway.jsonpath.JsonPath.read(board, "$.roundResult") != null) break;
            if (com.jayway.jsonpath.JsonPath.<Boolean>read(board, "$.reviewingCompletedTrick")) {
                mockMvc.perform(post("/api/private-tables/{tableId}/tricks/continue", owner.tableId())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(tokenBody(owner)))
                        .andExpect(status().isOk());
                continue;
            }
            String rank = com.jayway.jsonpath.JsonPath.read(board, "$.legalCards[0].rank");
            String suit = com.jayway.jsonpath.JsonPath.read(board, "$.legalCards[0].suit");
            mockMvc.perform(post("/api/private-tables/{tableId}/cards", owner.tableId())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"playerToken\":\"" + owner.token() + "\",\"rank\":\"" + rank
                                    + "\",\"suit\":\"" + suit + "\"}"))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(get("/api/private-tables/{tableId}/match", owner.tableId())
                        .queryParam("playerToken", owner.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(false))
                .andExpect(jsonPath("$.winner").value(""));
        mockMvc.perform(post("/api/private-tables/{tableId}/rematch", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(true));
        String next = mockMvc.perform(post("/api/private-tables/{tableId}/rounds/next", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(owner)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        // The bots may already have settled the new auction; what matters is that it is a new one.
        assertThat(com.jayway.jsonpath.JsonPath.<String>read(next, "$.auctionId")).isNotEqualTo(firstAuction);
    }

    private org.springframework.test.web.servlet.ResultActions setTarget(Session session, int target) throws Exception {
        return mockMvc.perform(post("/api/private-tables/{tableId}/target", session.tableId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerToken\":\"" + session.token() + "\",\"target\":" + target + "}"));
    }

    private org.springframework.test.web.servlet.ResultActions setAnnouncements(Session session, boolean enabled)
            throws Exception {
        return mockMvc.perform(post("/api/private-tables/{tableId}/announcements", session.tableId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerToken\":\"" + session.token() + "\",\"enabled\":" + enabled + "}"));
    }

    private Session startClassicTableWithBots() throws Exception {
        Session owner = createTable("Ana", "CLASSIC");
        ready(owner);
        mockMvc.perform(post("/api/private-tables/{tableId}/start-with-bots", owner.tableId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenBody(owner)))
                .andExpect(status().isOk());
        return owner;
    }

    private Session createContreeTable(String name) throws Exception {
        return createTable(name, "CONTREE");
    }

    private Session createTable(String name, String variant) throws Exception {
        String response = mockMvc.perform(post("/api/private-tables")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerName\":\"" + name + "\",\"variant\":\"" + variant + "\"}"))
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
