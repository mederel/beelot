package fr.beelot.application.bot;

import fr.beelot.application.account.AccountService;
import fr.beelot.game.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
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
    private final AccountService accounts;

    BotGameController(BotGameService botGameService, AccountService accounts) {
        this.botGameService = botGameService;
        this.accounts = accounts;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    BotGameResponse create(@RequestBody CreateBotGameRequest request, Authentication authentication) {
        if (request.seats() != null) {
            return BotGameResponse.from(botGameService.createPassAndPlay(request.difficulty(), request.variant(),
                    request.seats(), request.announcements(), request.target()));
        }
        return BotGameResponse.from(botGameService.create(request.difficulty(), request.variant(),
                accounts.currentId(authentication), request.announcements(), request.target()));
    }

    @GetMapping("/{gameId}")
    BotGameResponse get(@PathVariable UUID gameId) {
        return BotGameResponse.from(botGameService.get(gameId));
    }

    @GetMapping("/{gameId}/board")
    GameBoardResponse board(@PathVariable UUID gameId) {
        return GameBoardResponse.from(botGameService.boardView(gameId));
    }

    @GetMapping("/{gameId}/match")
    MatchResponse match(@PathVariable UUID gameId) {
        BotGameService.MatchStatus match = botGameService.matchStatus(gameId);
        return new MatchResponse(match.northSouth(), match.eastWest(), match.complete(), match.winner(),
                match.target());
    }

    @GetMapping("/{gameId}/bidding")
    BiddingResponse bidding(@PathVariable UUID gameId) {
        return biddingResponse(gameId, botGameService.bidding(gameId));
    }

    @PostMapping("/{gameId}/bids/pass")
    BiddingResponse pass(@PathVariable UUID gameId) {
        return biddingResponse(gameId, botGameService.pass(gameId));
    }

    @PostMapping("/{gameId}/bids/trump")
    GameBoardResponse chooseTrump(@PathVariable UUID gameId, @RequestBody ChooseTrumpRequest request) {
        botGameService.chooseTrump(gameId, request.suit());
        return GameBoardResponse.from(botGameService.boardView(gameId));
    }


    @PostMapping("/{gameId}/bids/contract")
    BiddingResponse bidContract(@PathVariable UUID gameId, @RequestBody ContractBidRequest request) {
        return biddingResponse(gameId, botGameService.bid(gameId, request.value(), request.suit()));
    }

    @PostMapping("/{gameId}/bids/coinche")
    GameBoardResponse coinche(@PathVariable UUID gameId) {
        botGameService.coinche(gameId);
        return GameBoardResponse.from(botGameService.boardView(gameId));
    }

    @PostMapping("/{gameId}/cards")
    GameBoardResponse playCard(@PathVariable UUID gameId, @RequestBody PlayCardRequest request) {
        botGameService.play(gameId, new GameCard(request.rank(), request.suit()), request.declare());
        return GameBoardResponse.from(botGameService.boardView(gameId));
    }

    @PostMapping("/{gameId}/tricks/continue")
    GameBoardResponse continueAfterTrick(@PathVariable UUID gameId) {
        botGameService.continueAfterTrick(gameId);
        return GameBoardResponse.from(botGameService.boardView(gameId));
    }

    @PostMapping("/{gameId}/rounds/next")
    BiddingResponse nextRound(@PathVariable UUID gameId) {
        return biddingResponse(gameId, botGameService.nextRound(gameId));
    }

    @PostMapping("/{gameId}/rematch")
    BiddingResponse rematch(@PathVariable UUID gameId) {
        return biddingResponse(gameId, botGameService.rematch(gameId));
    }

    /** The auction, with the seat of the human in charge of the device. */
    private BiddingResponse biddingResponse(UUID gameId, BiddingState.BiddingView bidding) {
        return BiddingResponse.from(bidding, botGameService.viewerIndex(gameId));
    }

    @ExceptionHandler(BotGameNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    void gameNotFound() {
    }

    @ExceptionHandler(InvalidMatchTargetException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponse invalidTarget(InvalidMatchTargetException exception) {
        return new ErrorResponse(exception.getMessage());
    }

    @ExceptionHandler(PrivateTableConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ErrorResponse illegalAction(PrivateTableConflictException exception) {
        return new ErrorResponse(exception.getMessage());
    }

    /**
     * {@code seats}, for pass and play only: the four seat names from North, empty for a bot. Announcements are on
     * unless {@code announcements} is false, and the match is played to 1,000 points unless {@code target} says
     * otherwise (US-062).
     */
    record CreateBotGameRequest(BotDifficulty difficulty, GameVariant variant, List<String> seats,
                                Boolean announcements, Integer target) {
        CreateBotGameRequest {
            if (variant == null) variant = GameVariant.CLASSIC;
            if (announcements == null) announcements = true;
            if (target == null) target = 1_000;
        }
    }

    record BotGameResponse(UUID id, BotDifficulty difficulty, String difficultyLabel,
                          GameVariant variant, String variantLabel, List<SeatResponse> seats, boolean passAndPlay,
                          boolean announcements, int target) {
        static BotGameResponse from(BotGame game) {
            List<SeatResponse> seats = game.seats().stream()
                    .map(seat -> new SeatResponse(seat.name(), seat.type().name()))
                    .toList();
            return new BotGameResponse(game.id(), game.difficulty(), game.difficulty().displayName(),
                    game.variant(), game.variant().displayName(), seats, game.passAndPlay(), game.announcements(),
                    game.target());
        }
    }

    record SeatResponse(String name, String type) {
    }

    record ChooseTrumpRequest(GameCard.Suit suit) {
    }

    record ContractBidRequest(int value, GameCard.Suit suit) {
    }

    /** {@code declare}, false when absent, declares the player's announcements with their first card (US-060). */
    record PlayCardRequest(String rank, GameCard.Suit suit, Boolean declare) {
        PlayCardRequest {
            if (declare == null) declare = false;
        }
    }

    record BiddingResponse(List<CardResponse> hand, CardResponse upturnedCard, int round, String activePlayer,
                           boolean playerTurn, String message, GameVariant variant,
                           int highestBid, String highestBidSuit, String highestBidder,
                           boolean coincheAllowed, boolean complete, int dealerIndex,
                           List<PlayerCallResponse> calls, int currentPlayerIndex) {
        static BiddingResponse from(BiddingState.BiddingView bidding, int currentPlayerIndex) {
            return new BiddingResponse(bidding.hand().stream().map(CardResponse::from).toList(),
                    bidding.upturnedCard() == null ? null : CardResponse.from(bidding.upturnedCard()),
                    bidding.round(), bidding.activePlayer(), bidding.playerTurn(), bidding.message(), bidding.variant(),
                    bidding.highestBid(), bidding.highestBidSuit() == null ? "" : bidding.highestBidSuit().name(),
                    bidding.highestBidder(), bidding.coincheAllowed(), bidding.complete(), bidding.dealerIndex(), bidding.calls().stream()
                    .map(PlayerCallResponse::from).toList(), currentPlayerIndex);
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
                             int dealerIndex, int declaringPlayerIndex, boolean announcements,
                             List<AnnouncementResponse> ownAnnouncements, List<String> declarers,
                             List<DeclarationResponse> revealedAnnouncements) {
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
                    board.activePlayerIndex(), board.dealerIndex(), board.declaringPlayerIndex(), board.announcements(),
                    board.ownAnnouncements().stream().map(AnnouncementResponse::from).toList(), board.declarers(),
                    board.revealedAnnouncements().stream().map(DeclarationResponse::from).toList());
        }
    }

    record RoundResultResponse(int northSouthCardPoints, int eastWestCardPoints, int northSouthDixDeDer,
                               int eastWestDixDeDer, int northSouthBeloteBonus, int eastWestBeloteBonus,
                               boolean contractMade, int northSouthAwarded, int eastWestAwarded, String capotTeam,
                               int northSouthAnnouncements, int eastWestAnnouncements) {
        static RoundResultResponse from(GameBoard.RoundResult result) {
            if (result == null) return null;
            return new RoundResultResponse(result.northSouthCardPoints(), result.eastWestCardPoints(), result.northSouthDixDeDer(),
                    result.eastWestDixDeDer(), result.northSouthBeloteBonus(), result.eastWestBeloteBonus(),
                    result.contractMade(), result.northSouthAwarded(), result.eastWestAwarded(), result.capotTeam(),
                    result.northSouthAnnouncements(), result.eastWestAnnouncements());
        }
    }

    /** {@code suit} is null for a carré. */
    record AnnouncementResponse(String kind, int value, String suit, List<CardResponse> cards, CardResponse topCard) {
        static AnnouncementResponse from(Announcement announcement) {
            return new AnnouncementResponse(announcement.kind().name(), announcement.value(),
                    announcement.suit() == null ? null : announcement.suit().name(),
                    announcement.cards().stream().map(CardResponse::from).toList(),
                    CardResponse.from(announcement.topCard()));
        }
    }

    record DeclarationResponse(int seat, String player, String team, List<AnnouncementResponse> announcements,
                               boolean scored) {
        static DeclarationResponse from(GameBoard.Declaration declaration) {
            return new DeclarationResponse(declaration.seat(), declaration.player(), declaration.team(),
                    declaration.announcements().stream().map(AnnouncementResponse::from).toList(),
                    declaration.scored());
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

    record MatchResponse(int northSouth, int eastWest, boolean complete, String winner, int target) {
    }
}
