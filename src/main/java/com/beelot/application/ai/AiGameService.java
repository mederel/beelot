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
        List<GameSeat> seats = List.of(
                new GameSeat(UUID.randomUUID(), "You", GameSeat.SeatType.HUMAN),
                new GameSeat(UUID.randomUUID(), "Camille", GameSeat.SeatType.AI),
                new GameSeat(UUID.randomUUID(), "Luc", GameSeat.SeatType.AI),
                new GameSeat(UUID.randomUUID(), "Manon", GameSeat.SeatType.AI)
        );
        AiGame game = new AiGame(
                UUID.randomUUID(),
                difficulty,
                seats,
                com.beelot.game.GameBoard.start(seats.stream()
                        .map(seat -> new com.beelot.game.GameBoard.GamePlayer(seat.playerId(), seat.name()))
                        .toList())
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
