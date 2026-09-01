package com.beelot.application.ai;

import com.beelot.game.AiDifficulty;
import com.beelot.game.AiGame;
import com.beelot.game.BiddingState;
import com.beelot.game.GameBoard;
import com.beelot.game.GameCard;
import com.beelot.game.GameSeat;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AiGameService {

    private final Map<UUID, AiGame> games = new ConcurrentHashMap<>();
    private final Map<UUID, BiddingState> biddingStates = new ConcurrentHashMap<>();
    private final Map<UUID, GameBoard> boards = new ConcurrentHashMap<>();

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
                seats
        );
        games.put(game.id(), game);
        biddingStates.put(game.id(), new BiddingState(seats.stream()
                .map(seat -> new GameBoard.GamePlayer(seat.playerId(), seat.name()))
                .toList()));
        return game;
    }

    public AiGame get(UUID id) {
        AiGame game = games.get(id);
        if (game == null) {
            throw new AiGameNotFoundException(id);
        }
        return game;
    }

    public BiddingState.BiddingView bidding(UUID id) {
        AiGame game = get(id);
        return biddingState(id).viewFor(humanPlayerId(game));
    }

    public BiddingState.BiddingView pass(UUID id) {
        AiGame game = get(id);
        BiddingState bidding = biddingState(id);
        bidding.pass(humanPlayerId(game));
        passForAiPlayers(game, bidding);
        return bidding.viewFor(humanPlayerId(game));
    }

    public GameBoard chooseTrump(UUID id, GameCard.Suit suit) {
        AiGame game = get(id);
        GameBoard board = biddingState(id).chooseTrump(humanPlayerId(game), suit);
        boards.put(id, board);
        return board;
    }

    public GameBoard board(UUID id) {
        get(id);
        GameBoard board = boards.get(id);
        if (board == null) {
            throw new AiGameNotFoundException(id);
        }
        return board;
    }

    public GameBoard play(UUID id, GameCard card) {
        AiGame game = get(id);
        GameBoard board = board(id);
        board.play(humanPlayerId(game), card);
        while (!board.viewFor(humanPlayerId(game)).reviewingCompletedTrick()) {
            board.playAutomatedTurn();
        }
        return board;
    }

    public GameBoard continueAfterTrick(UUID id) {
        AiGame game = get(id);
        GameBoard board = board(id);
        board.continueAfterTrick();
        while (!board.viewFor(humanPlayerId(game)).reviewingCompletedTrick()
                && !board.viewFor(humanPlayerId(game)).activePlayer().equals("You")) {
            board.playAutomatedTurn();
        }
        return board;
    }

    private BiddingState biddingState(UUID id) {
        BiddingState bidding = biddingStates.get(id);
        if (bidding == null) {
            throw new AiGameNotFoundException(id);
        }
        return bidding;
    }

    private UUID humanPlayerId(AiGame game) {
        return game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
    }

    private void passForAiPlayers(AiGame game, BiddingState bidding) {
        while (!bidding.activePlayerId().equals(humanPlayerId(game))) {
            bidding.pass(bidding.activePlayerId());
        }
    }
}
