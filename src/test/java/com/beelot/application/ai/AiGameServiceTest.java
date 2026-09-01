package com.beelot.application.ai;

import com.beelot.game.AiDifficulty;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiGameServiceTest {

    @Test
    void playerReceivesFiveCardsBeforeBiddingAndEightAfterChoosingTrump() {
        AiGameService service = new AiGameService();
        var game = service.create(AiDifficulty.RELAXED);
        var playerId = game.seats().stream()
                .filter(seat -> seat.type().name().equals("HUMAN"))
                .findFirst()
                .orElseThrow()
                .playerId();

        var bidding = service.bidding(game.id());
        assertEquals(5, bidding.hand().size());

        var board = service.chooseTrump(game.id(), bidding.upturnedCard().suit()).viewFor(playerId);

        assertEquals(8, board.hand().size());
        assertEquals(4, board.seats().size());
        assertEquals(32, board.seats().stream().mapToInt(seat -> seat.cardCount()).sum());
    }
}
