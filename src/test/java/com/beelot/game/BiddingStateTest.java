package com.beelot.game;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BiddingStateTest {

    @Test
    void passingTwiceAroundTheTableRedealsTheCards() {
        UUID playerId = UUID.randomUUID();
        BiddingState bidding = new BiddingState(List.of(
                new GameBoard.GamePlayer(playerId, "You"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "One"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Two"),
                new GameBoard.GamePlayer(UUID.randomUUID(), "Three")
        ));

        for (int turn = 0; turn < 4; turn++) {
            bidding.pass(bidding.activePlayerId());
        }
        assertEquals(2, bidding.viewFor(playerId).round());

        for (int turn = 0; turn < 4; turn++) {
            bidding.pass(bidding.activePlayerId());
        }

        assertEquals(1, bidding.viewFor(playerId).round());
        assertEquals(5, bidding.viewFor(playerId).hand().size());
        assertEquals("Everyone passed twice. The cards have been redealt.", bidding.viewFor(playerId).message());
    }
}
