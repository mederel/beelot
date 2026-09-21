package com.beelot.application.ai;

import com.beelot.game.AiDifficulty;
import com.beelot.game.AiGame;
import com.beelot.game.AiPlayers;
import com.beelot.game.BiddingState;
import com.beelot.game.GameBoard;
import com.beelot.game.GameCard;
import com.beelot.game.GameSeat;
import com.beelot.game.MatchScore;
import com.beelot.game.GameVariant;
import com.beelot.application.security.CapacityExceededException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
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
    private final Map<UUID, Instant> lastActivity = new ConcurrentHashMap<>();
    private final int maxGames;
    private final Duration idleExpiry;

    public AiGameService() {
        this(5000, Duration.ofHours(2));
    }

    @Autowired
    public AiGameService(@Value("${beelot.limits.max-ai-games:5000}") int maxGames,
                         @Value("${beelot.limits.idle-expiry:PT2H}") Duration idleExpiry) {
        this.maxGames = maxGames;
        this.idleExpiry = idleExpiry;
    }

    public AiGame create(AiDifficulty difficulty) {
        return create(difficulty, GameVariant.CLASSIC);
    }

    public AiGame create(AiDifficulty difficulty, GameVariant variant) {
        if (variant == null) variant = GameVariant.CLASSIC;
        if (games.size() >= maxGames) evictIdle(Instant.now());
        if (games.size() >= maxGames) {
            throw new CapacityExceededException("The server is busy. Please try again later.");
        }
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
        lastActivity.put(game.id(), Instant.now());
        biddingStates.put(game.id(), new BiddingState(seats.stream()
                .map(seat -> new GameBoard.GamePlayer(seat.playerId(), seat.name()))
                .toList(), variant));
        matches.put(game.id(), new MatchScore());
        playAiOpeningTurns(game.id());
        return game;
    }

    public AiGame get(UUID id) {
        AiGame game = games.get(id);
        if (game == null) {
            throw new AiGameNotFoundException(id);
        }
        lastActivity.put(id, Instant.now());
        return game;
    }

    /** Drops games that nobody has touched for the idle expiry, freeing their memory. */
    @Scheduled(fixedDelayString = "${beelot.limits.cleanup-interval:PT1M}")
    public void evictIdle() {
        evictIdle(Instant.now());
    }

    void evictIdle(Instant now) {
        Instant cutoff = now.minus(idleExpiry);
        lastActivity.forEach((id, last) -> {
            if (last.isBefore(cutoff)) {
                games.remove(id);
                biddingStates.remove(id);
                boards.remove(id);
                matches.remove(id);
                lastActivity.remove(id);
            }
        });
    }

    public int gameCount() {
        return games.size();
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
        playAiLeadTurns(id, board);
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
        int dealer = (biddingState(id).dealerIndex() + 1) % game.seats().size();
        BiddingState bidding = new BiddingState(game.seats().stream()
                .map(seat -> new GameBoard.GamePlayer(seat.playerId(), seat.name())).toList(), game.variant(), dealer);
        biddingStates.put(id, bidding);
        boards.remove(id);
        playAiOpeningTurns(id);
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
            AiPlayers.takeAuctionTurn(bidding, game.variant());
        }
    }

    /** When the human is not the first to speak, the bots bid before the human's first turn. */
    private void playAiOpeningTurns(UUID id) {
        BiddingState bidding = biddingState(id);
        playAiAuctionTurns(get(id), bidding);
        storeCompletedBoard(id, bidding);
    }

    /** When a bot leads the first trick, it plays until the human's turn. */
    private void playAiLeadTurns(UUID id, GameBoard board) {
        UUID humanId = humanPlayerId(get(id));
        while (!board.viewFor(humanId).reviewingCompletedTrick() && !board.activePlayerId().equals(humanId)) {
            board.playAutomatedTurn();
        }
    }

    private void storeCompletedBoard(UUID id, BiddingState bidding) {
        if (bidding.completedBoard() != null) boards.put(id, bidding.completedBoard());
    }

    private GameBoard requireCompletedBoard(UUID id, BiddingState bidding) {
        storeCompletedBoard(id, bidding);
        GameBoard board = boards.get(id);
        if (board == null) throw new com.beelot.game.PrivateTableConflictException("The auction is still in progress.");
        playAiLeadTurns(id, board);
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
