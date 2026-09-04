package com.beelot.application.ai;

import com.beelot.game.AiDifficulty;
import com.beelot.game.AiGame;
import com.beelot.game.BiddingState;
import com.beelot.game.GameBoard;
import com.beelot.game.GameCard;
import com.beelot.game.GameSeat;
import com.beelot.game.MatchScore;
import com.beelot.game.GameVariant;
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
    private final Map<UUID, MatchScore> matches = new ConcurrentHashMap<>();

    public AiGame create(AiDifficulty difficulty) {
        return create(difficulty, GameVariant.CLASSIC);
    }

    public AiGame create(AiDifficulty difficulty, GameVariant variant) {
        if (variant == null) variant = GameVariant.CLASSIC;
        List<GameSeat> seats = List.of(
                new GameSeat(UUID.randomUUID(), "You", GameSeat.SeatType.HUMAN),
                new GameSeat(UUID.randomUUID(), "Camille", GameSeat.SeatType.AI),
                new GameSeat(UUID.randomUUID(), "Luc", GameSeat.SeatType.AI),
                new GameSeat(UUID.randomUUID(), "Manon", GameSeat.SeatType.AI)
        );
        AiGame game = new AiGame(
                UUID.randomUUID(),
                difficulty,
                variant,
                seats
        );
        games.put(game.id(), game);
        biddingStates.put(game.id(), new BiddingState(seats.stream()
                .map(seat -> new GameBoard.GamePlayer(seat.playerId(), seat.name()))
                .toList(), variant));
        matches.put(game.id(), new MatchScore());
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
        playAiAuctionTurns(game, bidding);
        storeCompletedBoard(id, bidding);
        return bidding.viewFor(humanPlayerId(game));
    }

    public GameBoard bid(UUID id, int value, GameCard.Suit suit) {
        AiGame game = get(id);
        BiddingState bidding = biddingState(id);
        bidding.bid(humanPlayerId(game), value, suit);
        playAiAuctionTurns(game, bidding);
        return requireCompletedBoard(id, bidding);
    }

    public GameBoard coinche(UUID id) {
        AiGame game = get(id);
        BiddingState bidding = biddingState(id);
        bidding.coinche(humanPlayerId(game));
        return requireCompletedBoard(id, bidding);
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
        recordRoundIfComplete(id, board);
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

    public BiddingState.BiddingView nextRound(UUID id) {
        AiGame game = get(id);
        if (matches.get(id).complete()) throw new com.beelot.game.PrivateTableConflictException("This match has ended. Start a rematch.");
        BiddingState bidding = new BiddingState(game.seats().stream()
                .map(seat -> new GameBoard.GamePlayer(seat.playerId(), seat.name())).toList(), game.variant());
        biddingStates.put(id, bidding);
        boards.remove(id);
        return bidding.viewFor(humanPlayerId(game));
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

    private void playAiAuctionTurns(AiGame game, BiddingState bidding) {
        while (bidding.completedBoard() == null && !bidding.activePlayerId().equals(humanPlayerId(game))) {
            UUID aiPlayer = bidding.activePlayerId();
            BiddingState.BiddingView view = bidding.viewFor(aiPlayer);
            if (game.variant() == GameVariant.CONTREE && view.highestBid() == 0) {
                GameCard.Suit suit = strongestSuit(view.hand());
                bidding.bid(aiPlayer, 80, suit);
            } else {
                bidding.pass(aiPlayer);
            }
        }
    }

    private GameCard.Suit strongestSuit(List<GameCard> hand) {
        GameCard.Suit best = GameCard.Suit.CLUBS;
        long bestCount = -1;
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            long count = hand.stream().filter(card -> card.suit() == suit).count();
            if (count > bestCount) {
                best = suit;
                bestCount = count;
            }
        }
        return best;
    }

    private void storeCompletedBoard(UUID id, BiddingState bidding) {
        if (bidding.completedBoard() != null) boards.put(id, bidding.completedBoard());
    }

    private GameBoard requireCompletedBoard(UUID id, BiddingState bidding) {
        storeCompletedBoard(id, bidding);
        GameBoard board = boards.get(id);
        if (board == null) throw new com.beelot.game.PrivateTableConflictException("The auction is still in progress.");
        return board;
    }

    public BiddingState.BiddingView rematch(UUID id) {
        matches.put(id, new MatchScore());
        return nextRound(id);
    }

    public MatchStatus matchStatus(UUID id) {
        MatchScore score = matches.get(id);
        return new MatchStatus(score.northSouth(), score.eastWest(), score.complete(), score.winner());
    }

    private void recordRoundIfComplete(UUID id, GameBoard board) {
        GameBoard.RoundResult result = board.viewFor(humanPlayerId(get(id))).roundResult();
        if (result != null) matches.get(id).record(result);
    }

    public record MatchStatus(int northSouth, int eastWest, boolean complete, String winner) {
    }
}
