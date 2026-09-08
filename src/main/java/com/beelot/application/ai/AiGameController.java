package com.beelot.application.ai;

import com.beelot.game.AiDifficulty;
import com.beelot.game.AiGame;
import com.beelot.game.GameSeat;
import com.beelot.game.PrivateTableConflictException;
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
@RequestMapping("/api/ai-games")
class AiGameController {

    private final AiGameService aiGameService;

    AiGameController(AiGameService aiGameService) {
        this.aiGameService = aiGameService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    AiGameResponse create(@RequestBody CreateAiGameRequest request) {
        return AiGameResponse.from(aiGameService.create(request.difficulty(), request.variant()));
    }

    @GetMapping("/{gameId}")
    AiGameResponse get(@PathVariable UUID gameId) {
        return AiGameResponse.from(aiGameService.get(gameId));
    }

    @GetMapping("/{gameId}/board")
    GameBoardResponse board(@PathVariable UUID gameId) {
        AiGame game = aiGameService.get(gameId);
        UUID playerId = game.seats().stream()
                .filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst()
                .orElseThrow()
                .playerId();
        return GameBoardResponse.from(aiGameService.board(gameId).viewFor(playerId));
    }

    @GetMapping("/{gameId}/match")
    MatchResponse match(@PathVariable UUID gameId) {
        AiGameService.MatchStatus match = aiGameService.matchStatus(gameId);
        return new MatchResponse(match.northSouth(), match.eastWest(), match.complete(), match.winner());
    }

    @GetMapping("/{gameId}/bidding")
    BiddingResponse bidding(@PathVariable UUID gameId) {
        return BiddingResponse.from(aiGameService.bidding(gameId));
    }

    @PostMapping("/{gameId}/bids/pass")
    BiddingResponse pass(@PathVariable UUID gameId) {
        return BiddingResponse.from(aiGameService.pass(gameId));
    }

    @PostMapping("/{gameId}/bids/trump")
    GameBoardResponse chooseTrump(@PathVariable UUID gameId, @RequestBody ChooseTrumpRequest request) {
        AiGame game = aiGameService.get(gameId);
        UUID playerId = game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
        return GameBoardResponse.from(aiGameService.chooseTrump(gameId, request.suit()).viewFor(playerId));
    }


    @PostMapping("/{gameId}/bids/contract")
    GameBoardResponse bidContract(@PathVariable UUID gameId, @RequestBody ContractBidRequest request) {
        UUID playerId = humanPlayerId(aiGameService.get(gameId));
        return GameBoardResponse.from(aiGameService.bid(gameId, request.value(), request.suit()).viewFor(playerId));
    }

    @PostMapping("/{gameId}/bids/coinche")
    GameBoardResponse coinche(@PathVariable UUID gameId) {
        UUID playerId = humanPlayerId(aiGameService.get(gameId));
        return GameBoardResponse.from(aiGameService.coinche(gameId).viewFor(playerId));
    }

    @PostMapping("/{gameId}/cards")
    GameBoardResponse playCard(@PathVariable UUID gameId, @RequestBody PlayCardRequest request) {
        AiGame game = aiGameService.get(gameId);
        UUID playerId = game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
        return GameBoardResponse.from(aiGameService.play(gameId, new com.beelot.game.GameCard(request.rank(), request.suit()))
                .viewFor(playerId));
    }

    @PostMapping("/{gameId}/tricks/continue")
    GameBoardResponse continueAfterTrick(@PathVariable UUID gameId) {
        AiGame game = aiGameService.get(gameId);
        UUID playerId = game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
        return GameBoardResponse.from(aiGameService.continueAfterTrick(gameId).viewFor(playerId));
    }

    @PostMapping("/{gameId}/rounds/next")
    BiddingResponse nextRound(@PathVariable UUID gameId) {
        return BiddingResponse.from(aiGameService.nextRound(gameId));
    }

    @PostMapping("/{gameId}/rematch")
    BiddingResponse rematch(@PathVariable UUID gameId) {
        return BiddingResponse.from(aiGameService.rematch(gameId));
    }

    @ExceptionHandler(AiGameNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    void gameNotFound() {
    }

    @ExceptionHandler(PrivateTableConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ErrorResponse illegalAction(PrivateTableConflictException exception) {
        return new ErrorResponse(exception.getMessage());
    }

    record CreateAiGameRequest(AiDifficulty difficulty, com.beelot.game.GameVariant variant) {
        CreateAiGameRequest {
            if (variant == null) variant = com.beelot.game.GameVariant.CLASSIC;
        }
    }

    record AiGameResponse(UUID id, AiDifficulty difficulty, String difficultyLabel,
                          com.beelot.game.GameVariant variant, String variantLabel, List<SeatResponse> seats) {
        static AiGameResponse from(AiGame game) {
            List<SeatResponse> seats = game.seats().stream()
                    .map(seat -> new SeatResponse(seat.name(), seat.type().name()))
                    .toList();
            return new AiGameResponse(game.id(), game.difficulty(), game.difficulty().displayName(),
                    game.variant(), game.variant().displayName(), seats);
        }
    }

    record SeatResponse(String name, String type) {
    }

    record ChooseTrumpRequest(com.beelot.game.GameCard.Suit suit) {
    }

    record ContractBidRequest(int value, com.beelot.game.GameCard.Suit suit) {
    }

    record PlayCardRequest(String rank, com.beelot.game.GameCard.Suit suit) {
    }

    record BiddingResponse(List<CardResponse> hand, CardResponse upturnedCard, int round, String activePlayer,
                           boolean playerTurn, String message, com.beelot.game.GameVariant variant,
                           int highestBid, String highestBidSuit, String highestBidder,
                           boolean coincheAllowed, boolean complete) {
        static BiddingResponse from(com.beelot.game.BiddingState.BiddingView bidding) {
            return new BiddingResponse(bidding.hand().stream().map(CardResponse::from).toList(),
                    bidding.upturnedCard() == null ? null : CardResponse.from(bidding.upturnedCard()),
                    bidding.round(), bidding.activePlayer(), bidding.playerTurn(), bidding.message(), bidding.variant(),
                    bidding.highestBid(), bidding.highestBidSuit() == null ? "" : bidding.highestBidSuit().name(),
                    bidding.highestBidder(), bidding.coincheAllowed(), bidding.complete());
        }
    }

    record GameBoardResponse(List<CardResponse> hand, List<CardResponse> legalCards, List<BoardSeatResponse> seats, String trump,
                             String declaringTeam, String activePlayer, int completedTricks,
                             int northSouthScore, int eastWestScore, List<CardResponse> currentTrick,
                             boolean reviewingCompletedTrick, String trickWinner, int trickPoints,
                             String declarationMessage, int beloteBonusPoints, RoundResultResponse roundResult,
                             com.beelot.game.GameVariant variant, int contractValue, boolean coinched,
                             String currentPlayer, int currentPlayerIndex, int activePlayerIndex) {
        static GameBoardResponse from(com.beelot.game.GameBoard.GameBoardView board) {
            return new GameBoardResponse(
                    board.hand().stream().map(CardResponse::from).toList(),
                    board.legalCards().stream().map(CardResponse::from).toList(),
                    board.seats().stream().map(BoardSeatResponse::from).toList(),
                    board.trump(), board.declaringTeam(), board.activePlayer(), board.completedTricks(),
                    board.northSouthScore(), board.eastWestScore(), board.currentTrick().stream().map(CardResponse::from).toList(),
                    board.reviewingCompletedTrick(), board.trickWinner(), board.trickPoints(),
                    board.declarationMessage(), board.beloteBonusPoints(), RoundResultResponse.from(board.roundResult()),
                    board.variant(), board.contractValue(), board.coinched(), board.currentPlayer(), board.currentPlayerIndex(),
                    board.activePlayerIndex());
        }
    }

    private UUID humanPlayerId(AiGame game) {
        return game.seats().stream().filter(seat -> seat.type() == GameSeat.SeatType.HUMAN)
                .findFirst().orElseThrow().playerId();
    }

    record RoundResultResponse(int northSouthCardPoints, int eastWestCardPoints, int northSouthDixDeDer,
                               int eastWestDixDeDer, int northSouthBeloteBonus, int eastWestBeloteBonus,
                               boolean contractMade, int northSouthAwarded, int eastWestAwarded) {
        static RoundResultResponse from(com.beelot.game.GameBoard.RoundResult result) {
            if (result == null) return null;
            return new RoundResultResponse(result.northSouthCardPoints(), result.eastWestCardPoints(), result.northSouthDixDeDer(),
                    result.eastWestDixDeDer(), result.northSouthBeloteBonus(), result.eastWestBeloteBonus(),
                    result.contractMade(), result.northSouthAwarded(), result.eastWestAwarded());
        }
    }

    record CardResponse(String rank, String suit, String symbol) {
        static CardResponse from(com.beelot.game.GameCard card) {
            return new CardResponse(card.rank(), card.suit().name(), card.suit().symbol());
        }
    }

    record BoardSeatResponse(String name, int cardCount, boolean active, String team) {
        static BoardSeatResponse from(com.beelot.game.GameBoard.GameBoardSeat seat) {
            return new BoardSeatResponse(seat.name(), seat.cardCount(), seat.active(), seat.team());
        }
    }

    record ErrorResponse(String message) {
    }

    record MatchResponse(int northSouth, int eastWest, boolean complete, String winner) {
    }
}
