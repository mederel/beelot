package com.beelot.application.ai;

import com.beelot.game.AiDifficulty;
import com.beelot.game.AiGame;
import com.beelot.game.GameSeat;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AiGameService {

    private final Map<UUID, AiGame> games = new ConcurrentHashMap<>();

    public AiGame create(AiDifficulty difficulty) {
        AiGame game = new AiGame(
                UUID.randomUUID(),
                difficulty,
                List.of(
                        new GameSeat("You", GameSeat.SeatType.HUMAN),
                        new GameSeat("Camille", GameSeat.SeatType.AI),
                        new GameSeat("Luc", GameSeat.SeatType.AI),
                        new GameSeat("Manon", GameSeat.SeatType.AI)
                )
        );
        games.put(game.id(), game);
        return game;
    }

    public AiGame get(UUID id) {
        AiGame game = games.get(id);
        if (game == null) {
            throw new AiGameNotFoundException(id);
        }
        return game;
    }
}
