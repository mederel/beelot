package fr.beelot.application.bot;

import fr.beelot.game.*;
import fr.beelot.game.bot.BotStrategies;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.BotTurns;
import fr.beelot.application.history.FinishedMatch;
import fr.beelot.application.history.MatchRecorder;
import fr.beelot.application.security.CapacityExceededException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/**
 * Games against bots: a solo game with one human, or a pass-and-play game in which two to four humans share one
 * device (US-019). Bots play their turns until a human's turn, and each view shows the hand of the human in charge
 * of the device: the human whose turn it is, or, while a completed trick is shown, the human who played last.
 */
@Service
public class BotGameService {

    private static final List<String> BOT_NAMES = List.of("Camille", "Luc", "Manon", "Hugo");
    private static final int MAX_NAME_LENGTH = 30;

    private final Map<UUID, BotGame> games = new ConcurrentHashMap<>();
    private final Map<UUID, BiddingState> biddingStates = new ConcurrentHashMap<>();
    private final Map<UUID, GameBoard> boards = new ConcurrentHashMap<>();
    private final Map<UUID, MatchScore> matches = new ConcurrentHashMap<>();
    private final Map<UUID, GameBoard> recordedBoards = new ConcurrentHashMap<>();
    private final Map<UUID, UUID> accountIds = new ConcurrentHashMap<>();
    private final Map<UUID, UUID> viewers = new ConcurrentHashMap<>();
    private final Map<UUID, Instant> lastActivity = new ConcurrentHashMap<>();
    private final int maxGames;
    private final Duration idleExpiry;
    private final Function<BotDifficulty, BotStrategy> strategies;
    private final MatchRecorder matchRecorder;

    public BotGameService() {
        this(5000, Duration.ofHours(2));
    }

    public BotGameService(int maxGames, Duration idleExpiry) {
        this(maxGames, idleExpiry, BotStrategies::forDifficulty, MatchRecorder.NONE);
    }

    @Autowired
    public BotGameService(@Value("${beelot.limits.max-bot-games:5000}") int maxGames,
                         @Value("${beelot.limits.idle-expiry:PT2H}") Duration idleExpiry,
                         MatchRecorder matchRecorder) {
        this(maxGames, idleExpiry, BotStrategies::forDifficulty, matchRecorder);
    }

    /**
     * The bots of each game play the strategy of the game's difficulty level, and each match is handed to the
     * recorder when a team wins it.
     */
    BotGameService(int maxGames, Duration idleExpiry, Function<BotDifficulty, BotStrategy> strategies,
                   MatchRecorder matchRecorder) {
        this.maxGames = maxGames;
        this.idleExpiry = idleExpiry;
        this.strategies = strategies;
        this.matchRecorder = matchRecorder;
    }

    public BotGame create(BotDifficulty difficulty) {
        return create(difficulty, GameVariant.CLASSIC);
    }

    public BotGame create(BotDifficulty difficulty, GameVariant variant) {
        return create(difficulty, variant, null);
    }

    /** A game whose human seat belongs to the given account, or to a guest when it is null. */
    public BotGame create(BotDifficulty difficulty, GameVariant variant, UUID accountId) {
        List<GameSeat> seats = List.of(
                new GameSeat(UUID.randomUUID(), "You", GameSeat.SeatType.HUMAN),
                new GameSeat(UUID.randomUUID(), "Camille", GameSeat.SeatType.BOT),
                new GameSeat(UUID.randomUUID(), "Luc", GameSeat.SeatType.BOT),
                new GameSeat(UUID.randomUUID(), "Manon", GameSeat.SeatType.BOT)
        );
        return start(difficulty, variant, seats, accountId);
    }

    /**
     * A pass-and-play game: the given names, in play order from North, are the humans sharing the device, and bots
     * take the seats left empty (null or blank). Two to four humans with different names are needed. Such matches
     * are not recorded in the history, since the players cannot be told apart.
     */
    public BotGame createPassAndPlay(BotDifficulty difficulty, GameVariant variant, List<String> seatNames) {
        if (seatNames == null || seatNames.size() != 4) {
            throw new PrivateTableConflictException("Fill in the four seats.");
        }
        List<String> humans = seatNames.stream().filter(name -> name != null && !name.isBlank()).map(String::strip)
                .toList();
        if (humans.size() < 2) throw new PrivateTableConflictException("Pass and play needs at least two players.");
        if (humans.stream().anyMatch(name -> name.length() > MAX_NAME_LENGTH)) {
            throw new PrivateTableConflictException("Player names are limited to " + MAX_NAME_LENGTH + " characters.");
        }
        if (humans.stream().map(String::toLowerCase).distinct().count() < humans.size()) {
            throw new PrivateTableConflictException("Each player needs a different name.");
        }
        List<String> botNames = BOT_NAMES.stream()
                .filter(bot -> humans.stream().noneMatch(name -> name.equalsIgnoreCase(bot))).toList();
        List<GameSeat> seats = new ArrayList<>();
        int bots = 0;
        for (String name : seatNames) {
            boolean human = name != null && !name.isBlank();
            seats.add(new GameSeat(UUID.randomUUID(), human ? name.strip() : botNames.get(bots++),
                    human ? GameSeat.SeatType.HUMAN : GameSeat.SeatType.BOT));
        }
        return start(difficulty, variant, seats, null);
    }

    private BotGame start(BotDifficulty difficulty, GameVariant variant, List<GameSeat> seats, UUID accountId) {
        if (variant == null) variant = GameVariant.CLASSIC;
        if (games.size() >= maxGames) evictIdle(Instant.now());
        if (games.size() >= maxGames) {
            throw new CapacityExceededException("The server is busy. Please try again later.");
        }
        BotGame game = new BotGame(UUID.randomUUID(), difficulty, variant, seats);
        games.put(game.id(), game);
        if (accountId != null) accountIds.put(game.id(), accountId);
        lastActivity.put(game.id(), Instant.now());
        biddingStates.put(game.id(), new BiddingState(seats.stream()
                .map(seat -> new GameBoard.GamePlayer(seat.playerId(), seat.name()))
                .toList(), variant));
        matches.put(game.id(), new MatchScore());
        playBotOpeningTurns(game.id());
        return game;
    }

    public BotGame get(UUID id) {
        BotGame game = games.get(id);
        if (game == null) {
            throw new BotGameNotFoundException(id);
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
                recordedBoards.remove(id);
                accountIds.remove(id);
                viewers.remove(id);
                lastActivity.remove(id);
            }
        });
    }

    public int gameCount() {
        return games.size();
    }

    /** The auction as the human in charge of the device sees it. */
    public BiddingState.BiddingView bidding(UUID id) {
        get(id);
        return biddingState(id).viewFor(viewer(id));
    }

    public BiddingState.BiddingView pass(UUID id) {
        BotGame game = get(id);
        BiddingState bidding = biddingState(id);
        bidding.pass(humanToAct(game, bidding.activePlayerId()));
        playBotAuctionTurns(game, bidding);
        storeCompletedBoard(id, bidding);
        return bidding.viewFor(viewer(id));
    }

    /** A bot may support its partner's bid, so the auction can come back to the human after their bid. */
    public BiddingState.BiddingView bid(UUID id, int value, GameCard.Suit suit) {
        BotGame game = get(id);
        BiddingState bidding = biddingState(id);
        bidding.bid(humanToAct(game, bidding.activePlayerId()), value, suit);
        playBotAuctionTurns(game, bidding);
        if (bidding.completedBoard() != null) requireCompletedBoard(id, bidding);
        return bidding.viewFor(viewer(id));
    }

    public GameBoard coinche(UUID id) {
        BotGame game = get(id);
        BiddingState bidding = biddingState(id);
        bidding.coinche(humanToAct(game, bidding.activePlayerId()));
        return requireCompletedBoard(id, bidding);
    }

    public GameBoard chooseTrump(UUID id, GameCard.Suit suit) {
        BotGame game = get(id);
        BiddingState bidding = biddingState(id);
        GameBoard board = bidding.chooseTrump(humanToAct(game, bidding.activePlayerId()), suit);
        boards.put(id, board);
        playBotLeadTurns(id, board);
        return board;
    }

    public GameBoard board(UUID id) {
        get(id);
        GameBoard board = boards.get(id);
        if (board == null) {
            throw new BotGameNotFoundException(id);
        }
        return board;
    }

    /** The card table as the human in charge of the device sees it. */
    public GameBoard.GameBoardView boardView(UUID id) {
        GameBoard board = board(id);
        return board.viewFor(viewer(id));
    }

    /** The seat of the human in charge of the device, in play order from North. */
    public int viewerIndex(UUID id) {
        UUID viewer = viewer(id);
        List<GameSeat> seats = get(id).seats();
        for (int index = 0; index < seats.size(); index++) if (seats.get(index).playerId().equals(viewer)) return index;
        throw new IllegalStateException("The viewer has no seat.");
    }

    /** The human whose turn it is plays the card; bots then play until a human's turn or the end of the trick. */
    public GameBoard play(UUID id, GameCard card) {
        BotGame game = get(id);
        GameBoard board = board(id);
        UUID player = humanToAct(game, board.activePlayerId());
        board.play(player, card);
        viewers.put(id, player);
        playBotTurns(game, board);
        recordRoundIfComplete(id, board);
        return board;
    }

    public GameBoard continueAfterTrick(UUID id) {
        BotGame game = get(id);
        GameBoard board = board(id);
        board.continueAfterTrick();
        playBotTurns(game, board);
        recordRoundIfComplete(id, board);
        return board;
    }

    public BiddingState.BiddingView nextRound(UUID id) {
        BotGame game = get(id);
        if (matches.get(id).complete()) throw new PrivateTableConflictException("This match has ended. Start a rematch.");
        int dealer = (biddingState(id).dealerIndex() + 1) % game.seats().size();
        BiddingState bidding = new BiddingState(game.seats().stream()
                .map(seat -> new GameBoard.GamePlayer(seat.playerId(), seat.name())).toList(), game.variant(), dealer);
        biddingStates.put(id, bidding);
        boards.remove(id);
        playBotOpeningTurns(id);
        return bidding.viewFor(viewer(id));
    }

    private BiddingState biddingState(UUID id) {
        BiddingState bidding = biddingStates.get(id);
        if (bidding == null) {
            throw new BotGameNotFoundException(id);
        }
        return bidding;
    }

    private BotStrategy strategy(BotGame game) {
        return strategies.apply(game.difficulty());
    }

    private static boolean human(BotGame game, UUID playerId) {
        return game.seats().stream()
                .anyMatch(seat -> seat.playerId().equals(playerId) && seat.type() == GameSeat.SeatType.HUMAN);
    }

    /** The active player, who must be a human: bots play their own turns. */
    private static UUID humanToAct(BotGame game, UUID activePlayerId) {
        if (!human(game, activePlayerId)) throw new PrivateTableConflictException("It is not your turn.");
        return activePlayerId;
    }

    /**
     * The human in charge of the device: the active player when that is a human and no completed trick is on the
     * table, otherwise the human who was in charge before (the first human at the start of the game).
     */
    private UUID viewer(UUID id) {
        BotGame game = get(id);
        GameBoard board = boards.get(id);
        UUID active = board != null ? board.activePlayerId() : biddingState(id).activePlayerId();
        boolean trickShown = board != null && (board.roundSummary() != null
                || board.viewFor(active).reviewingCompletedTrick());
        if (human(game, active) && !trickShown) {
            viewers.put(id, active);
            return active;
        }
        return viewers.computeIfAbsent(id, key -> game.seats().stream()
                .filter(seat -> seat.type() == GameSeat.SeatType.HUMAN).findFirst().orElseThrow().playerId());
    }

    private void playBotAuctionTurns(BotGame game, BiddingState bidding) {
        while (bidding.completedBoard() == null && !human(game, bidding.activePlayerId())) {
            BotTurns.takeAuctionTurn(bidding, strategy(game));
        }
    }

    /** Bots play until a human's turn or until a trick is complete. */
    private void playBotTurns(BotGame game, GameBoard board) {
        while (!board.viewFor(board.activePlayerId()).reviewingCompletedTrick()
                && !human(game, board.activePlayerId())) {
            BotTurns.playTurn(board, strategy(game));
        }
    }

    /** When the human is not the first to speak, the bots bid before the human's first turn. */
    private void playBotOpeningTurns(UUID id) {
        BiddingState bidding = biddingState(id);
        playBotAuctionTurns(get(id), bidding);
        storeCompletedBoard(id, bidding);
    }

    /** When a bot leads the first trick, it plays until a human's turn. */
    private void playBotLeadTurns(UUID id, GameBoard board) {
        playBotTurns(get(id), board);
    }

    /** Once the auction is over, whoever ended it, bots play up to the human's first card. */
    private void storeCompletedBoard(UUID id, BiddingState bidding) {
        GameBoard board = bidding.completedBoard();
        if (board == null) return;
        boards.put(id, board);
        playBotLeadTurns(id, board);
    }

    private GameBoard requireCompletedBoard(UUID id, BiddingState bidding) {
        storeCompletedBoard(id, bidding);
        GameBoard board = boards.get(id);
        if (board == null) throw new PrivateTableConflictException("The auction is still in progress.");
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

    /** Adds a finished round to the match score once, and hands the match over when it ends. */
    private void recordRoundIfComplete(UUID id, GameBoard board) {
        GameBoard.RoundSummary round = board.roundSummary();
        if (round == null || recordedBoards.put(id, board) == board) return;
        MatchScore score = matches.get(id);
        BotGame game = get(id);
        if (score.record(round) && !game.passAndPlay()) matchRecorder.record(finishedMatch(game, score));
    }

    private FinishedMatch finishedMatch(BotGame game, MatchScore score) {
        UUID accountId = accountIds.get(game.id());
        List<FinishedMatch.Seat> seats = game.seats().stream().map(seat -> new FinishedMatch.Seat(
                seat.type() == GameSeat.SeatType.HUMAN ? accountId : null, seat.name(),
                seat.type() == GameSeat.SeatType.BOT)).toList();
        return new FinishedMatch(score.id(), Instant.now(), FinishedMatch.Mode.SOLO, game.variant(), game.difficulty(),
                score.northSouth(), score.eastWest(), score.winner(), seats, score.rounds());
    }

    public record MatchStatus(int northSouth, int eastWest, boolean complete, String winner) {
    }
}
