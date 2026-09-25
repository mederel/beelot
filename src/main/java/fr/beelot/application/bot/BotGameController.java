package fr.beelot.application.bot;

import fr.beelot.game.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/bot-games")
class BotGameController {

    private final BotGameService botGameService;

    BotGameController(BotGameService botGameService) {
        this.botGameService = botGameService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    BotGameResponse create(@RequestBody CreateBotGameRequest request) {
        return BotGameResponse.from(botGameService.create(request.difficulty(), request.variant()));
    }

    @GetMapping("/{gameId}")
    BotGameResponse get(@PathVariable UUID gameId) {
        return BotGameResponse.from(botGameService.get(gameId));
    }

    @GetMapping("/{gameId}/board")
    GameBoardResponse board(@PathVariable UUID gameId) {
        BotGame game = botGameService.get(gameId);
        UUID playerId = game.seats().stream()
                .filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst()
                .orElseThrow()
                .playerId();
        return GameBoardResponse.from(botGameService.board(gameId).viewFor(playerId));
    }

    @GetMapping("/{gameId}/match")
    MatchResponse match(@PathVariable UUID gameId) {
        BotGameService.MatchStatus match = botGameService.matchStatus(gameId);
        return new MatchResponse(match.northSouth(), match.eastWest(), match.complete(), match.winner());
    }

    @GetMapping("/{gameId}/bidding")
    BiddingResponse bidding(@PathVariable UUID gameId) {
        return BiddingResponse.from(botGameService.bidding(gameId));
    }

    @PostMapping("/{gameId}/bids/pass")
    BiddingResponse pass(@PathVariable UUID gameId) {
        return BiddingResponse.from(botGameService.pass(gameId));
    }

    @PostMapping("/{gameId}/bids/trump")
    GameBoardResponse chooseTrump(@PathVariable UUID gameId, @RequestBody ChooseTrumpRequest request) {
        BotGame game = botGameService.get(gameId);
        UUID playerId = game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
        return GameBoardResponse.from(botGameService.chooseTrump(gameId, request.suit()).viewFor(playerId));
    }


    @PostMapping("/{gameId}/bids/contract")
    BiddingResponse bidContract(@PathVariable UUID gameId, @RequestBody ContractBidRequest request) {
        return BiddingResponse.from(botGameService.bid(gameId, request.value(), request.suit()));
    }

    @PostMapping("/{gameId}/bids/coinche")
    GameBoardResponse coinche(@PathVariable UUID gameId) {
        UUID playerId = humanPlayerId(botGameService.get(gameId));
        return GameBoardResponse.from(botGameService.coinche(gameId).viewFor(playerId));
    }

    @PostMapping("/{gameId}/cards")
    GameBoardResponse playCard(@PathVariable UUID gameId, @RequestBody PlayCardRequest request) {
        BotGame game = botGameService.get(gameId);
        UUID playerId = game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
        return GameBoardResponse.from(botGameService.play(gameId, new GameCard(request.rank(), request.suit()))
                .viewFor(playerId));
    }

    @PostMapping("/{gameId}/tricks/continue")
    GameBoardResponse continueAfterTrick(@PathVariable UUID gameId) {
        BotGame game = botGameService.get(gameId);
        UUID playerId = game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
        return GameBoardResponse.from(botGameService.continueAfterTrick(gameId).viewFor(playerId));
    }

    @PostMapping("/{gameId}/rounds/next")
    BiddingResponse nextRound(@PathVariable UUID gameId) {
        return BiddingResponse.from(botGameService.nextRound(gameId));
    }

    @PostMapping("/{gameId}/rematch")
    BiddingResponse rematch(@PathVariable UUID gameId) {
        return BiddingResponse.from(botGameService.rematch(gameId));
    }

    @ExceptionHandler(BotGameNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    void gameNotFound() {
    }

    @ExceptionHandler(PrivateTableConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ErrorResponse illegalAction(PrivateTableConflictException exception) {
        return new ErrorResponse(exception.getMessage());
    }

    record CreateBotGameRequest(BotDifficulty difficulty, GameVariant variant) {
        CreateBotGameRequest {
            if (variant == null) variant = GameVariant.CLASSIC;
        }
    }

    record BotGameResponse(UUID id, BotDifficulty difficulty, String difficultyLabel,
                          GameVariant variant, String variantLabel, List<SeatResponse> seats) {
        static BotGameResponse from(BotGame game) {
            List<SeatResponse> seats = game.seats().stream()
                    .map(seat -> new SeatResponse(seat.name(), seat.type().name()))
                    .toList();
            return new BotGameResponse(game.id(), game.difficulty(), game.difficulty().displayName(),
                    game.variant(), game.variant().displayName(), seats);
        }
    }

    record SeatResponse(String name, String type) {
    }

    record ChooseTrumpRequest(GameCard.Suit suit) {
    }

    record ContractBidRequest(int value, GameCard.Suit suit) {
    }

    record PlayCardRequest(String rank, GameCard.Suit suit) {
    }

    record BiddingResponse(List<CardResponse> hand, CardResponse upturnedCard, int round, String activePlayer,
                           boolean playerTurn, String message, GameVariant variant,
                           int highestBid, String highestBidSuit, String highestBidder,
                           boolean coincheAllowed, boolean complete, int dealerIndex,
                           List<PlayerCallResponse> calls) {
        static BiddingResponse from(BiddingState.BiddingView bidding) {
            return new BiddingResponse(bidding.hand().stream().map(CardResponse::from).toList(),
                    bidding.upturnedCard() == null ? null : CardResponse.from(bidding.upturnedCard()),
                    bidding.round(), bidding.activePlayer(), bidding.playerTurn(), bidding.message(), bidding.variant(),
                    bidding.highestBid(), bidding.highestBidSuit() == null ? "" : bidding.highestBidSuit().name(),
                    bidding.highestBidder(), bidding.coincheAllowed(), bidding.complete(), bidding.dealerIndex(), bidding.calls().stream()
                    .map(PlayerCallResponse::from).toList());
        }
    }

    record PlayerCallResponse(String playerName, String call, boolean active) {
        static PlayerCallResponse from(BiddingState.PlayerCall call) {
            return new PlayerCallResponse(call.playerName(), call.call(), call.active());
        }
    }

    record GameBoardResponse(List<CardResponse> hand, List<CardResponse> legalCards, List<BoardSeatResponse> seats, String trump,
                             String declaringTeam, String activePlayer, int completedTricks,
                             int northSouthScore, int eastWestScore, List<CardResponse> currentTrick,
                             boolean reviewingCompletedTrick, String trickWinner, int trickPoints,
                             String declarationMessage, int beloteBonusPoints, RoundResultResponse roundResult,
                             GameVariant variant, int contractValue, boolean coinched,
                             String currentPlayer, int currentPlayerIndex, int activePlayerIndex,
                             int dealerIndex) {
        static GameBoardResponse from(GameBoard.GameBoardView board) {
            return new GameBoardResponse(
                    board.hand().stream().map(CardResponse::from).toList(),
                    board.legalCards().stream().map(CardResponse::from).toList(),
                    board.seats().stream().map(BoardSeatResponse::from).toList(),
                    board.trump(), board.declaringTeam(), board.activePlayer(), board.completedTricks(),
                    board.northSouthScore(), board.eastWestScore(), board.currentTrick().stream().map(CardResponse::from).toList(),
                    board.reviewingCompletedTrick(), board.trickWinner(), board.trickPoints(),
                    board.declarationMessage(), board.beloteBonusPoints(), RoundResultResponse.from(board.roundResult()),
                    board.variant(), board.contractValue(), board.coinched(), board.currentPlayer(), board.currentPlayerIndex(),
                    board.activePlayerIndex(), board.dealerIndex());
        }
    }

    private UUID humanPlayerId(BotGame game) {
        return game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
    }

    record RoundResultResponse(int northSouthCardPoints, int eastWestCardPoints, int northSouthDixDeDer,
                               int eastWestDixDeDer, int northSouthBeloteBonus, int eastWestBeloteBonus,
                               boolean contractMade, int northSouthAwarded, int eastWestAwarded) {
        static RoundResultResponse from(GameBoard.RoundResult result) {
            if (result == null) return null;
            return new RoundResultResponse(result.northSouthCardPoints(), result.eastWestCardPoints(), result.northSouthDixDeDer(),
                    result.eastWestDixDeDer(), result.northSouthBeloteBonus(), result.eastWestBeloteBonus(),
                    result.contractMade(), result.northSouthAwarded(), result.eastWestAwarded());
        }
    }

    record CardResponse(String rank, String suit, String symbol) {
        static CardResponse from(GameCard card) {
            return new CardResponse(card.rank(), card.suit().name(), card.suit().symbol());
        }
    }

    record BoardSeatResponse(String name, int cardCount, boolean active, String team) {
        static BoardSeatResponse from(GameBoard.GameBoardSeat seat) {
            return new BoardSeatResponse(seat.name(), seat.cardCount(), seat.active(), seat.team());
        }
    }

    record ErrorResponse(String message) {
    }

    record MatchResponse(int northSouth, int eastWest, boolean complete, String winner) {
    }
}
