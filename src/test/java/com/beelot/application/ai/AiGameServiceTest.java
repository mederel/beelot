package com.beelot.application.ai;

import com.beelot.game.AiDifficulty;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiGameServiceTest {

    @Test
    void playerBoardContainsOnlyTheirEightCards() {
        AiGameService service = new AiGameService();
        var game = service.create(AiDifficulty.RELAXED);
        var playerId = game.seats().stream()
                .filter(seat -> seat.type().name().equals("HUMAN"))
                .findFirst()
                .orElseThrow()
                .playerId();

        var board = game.board().viewFor(playerId);

        assertEquals(8, board.hand().size());
        assertEquals(4, board.seats().size());
        assertEquals(32, board.seats().stream().mapToInt(seat -> seat.cardCount()).sum());
    }
}
