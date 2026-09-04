package com.beelot.application.privategame;

import com.beelot.game.PrivateTable;
import com.beelot.game.PrivateTableConflictException;
import com.beelot.game.PrivateTableSeat;
import com.beelot.game.PrivateTableStatus;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/private-tables")
class PrivateTableController {

    private final PrivateTableService privateTableService;

    PrivateTableController(PrivateTableService privateTableService) {
        this.privateTableService = privateTableService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    PrivateTableSessionResponse create(@RequestBody CreatePrivateTableRequest request) {
        return PrivateTableSessionResponse.from(privateTableService.create(request.playerName(), request.variant()));
    }

    @PostMapping("/join")
    @ResponseStatus(HttpStatus.CREATED)
    PrivateTableSessionResponse join(@RequestBody JoinPrivateTableRequest request) {
        return PrivateTableSessionResponse.from(privateTableService.join(request.invitationCode(), request.playerName()));
    }

    @GetMapping("/{tableId}")
    PrivateTableResponse get(@PathVariable UUID tableId) {
        return PrivateTableResponse.from(privateTableService.get(tableId));
    }

    @PostMapping("/{tableId}/ready")
    PrivateTableResponse ready(@PathVariable UUID tableId, @RequestBody ReadyRequest request) {
        return PrivateTableResponse.from(privateTableService.ready(tableId, request.playerToken(), request.ready()));
    }

    @PostMapping("/{tableId}/start")
    PrivateTableResponse start(@PathVariable UUID tableId, @RequestBody PlayerTokenRequest request) {
        return PrivateTableResponse.from(privateTableService.start(tableId, request.playerToken()));
    }

    @PostMapping("/{tableId}/turn-timer")
    PrivateTableResponse setTurnTimer(@PathVariable UUID tableId, @RequestBody TurnTimerRequest request) {
        return PrivateTableResponse.from(privateTableService.setTurnTimer(tableId, request.playerToken(), request.seconds()));
    }

    @PostMapping("/{tableId}/disconnect")
    PrivateTableResponse disconnect(@PathVariable UUID tableId, @RequestBody PlayerTokenRequest request) {
        return PrivateTableResponse.from(privateTableService.disconnect(tableId, request.playerToken()));
    }

    @PostMapping("/{tableId}/reconnect")
    PrivateTableSessionResponse reconnect(@PathVariable UUID tableId, @RequestBody PlayerTokenRequest request) {
        return PrivateTableSessionResponse.from(privateTableService.reconnect(tableId, request.playerToken()));
    }

    @GetMapping("/{tableId}/bidding")
    BiddingResponse bidding(@PathVariable UUID tableId, @RequestParam UUID playerToken) {
        return BiddingResponse.from(privateTableService.bidding(tableId, playerToken));
    }

    @PostMapping("/{tableId}/bids/pass")
    BiddingResponse pass(@PathVariable UUID tableId, @RequestBody PlayerTokenRequest request) {
        return BiddingResponse.from(privateTableService.pass(tableId, request.playerToken()));
    }

    @PostMapping("/{tableId}/bids/contract")
    BiddingResponse bid(@PathVariable UUID tableId, @RequestBody ContractBidRequest request) {
        return BiddingResponse.from(privateTableService.bid(tableId, request.playerToken(), request.value(), request.suit()));
    }

    @PostMapping("/{tableId}/bids/coinche")
    BiddingResponse coinche(@PathVariable UUID tableId, @RequestBody PlayerTokenRequest request) {
        return BiddingResponse.from(privateTableService.coinche(tableId, request.playerToken()));
    }

    @PostMapping("/{tableId}/bids/trump")
    BoardResponse chooseTrump(@PathVariable UUID tableId, @RequestBody TrumpRequest request) {
        privateTableService.chooseTrump(tableId, request.playerToken(), request.suit());
        return BoardResponse.from(privateTableService.board(tableId, request.playerToken()));
    }

    @GetMapping("/{tableId}/board")
    BoardResponse board(@PathVariable UUID tableId, @RequestParam UUID playerToken) {
        return BoardResponse.from(privateTableService.board(tableId, playerToken));
    }

    @PostMapping("/{tableId}/cards")
    BoardResponse play(@PathVariable UUID tableId, @RequestBody CardPlayRequest request) {
        return BoardResponse.from(privateTableService.play(tableId, request.playerToken(),
                new com.beelot.game.GameCard(request.rank(), request.suit())));
    }

    @PostMapping("/{tableId}/tricks/continue")
    BoardResponse continueTrick(@PathVariable UUID tableId, @RequestBody PlayerTokenRequest request) {
        return BoardResponse.from(privateTableService.continueAfterTrick(tableId, request.playerToken()));
    }

    @ExceptionHandler(PrivateTableConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ErrorResponse conflict(PrivateTableConflictException exception) {
        return new ErrorResponse(exception.getMessage());
    }

    record CreatePrivateTableRequest(String playerName, com.beelot.game.GameVariant variant) {
        CreatePrivateTableRequest {
            if (variant == null) variant = com.beelot.game.GameVariant.CLASSIC;
        }
    }

    record JoinPrivateTableRequest(String invitationCode, String playerName) {
    }

    record PlayerTokenRequest(UUID playerToken) {
    }

    record ReadyRequest(UUID playerToken, boolean ready) {
    }

    record TurnTimerRequest(UUID playerToken, int seconds) {
    }

    record ContractBidRequest(UUID playerToken, int value, com.beelot.game.GameCard.Suit suit) {
    }

    record TrumpRequest(UUID playerToken, com.beelot.game.GameCard.Suit suit) {
    }

    record CardPlayRequest(UUID playerToken, String rank, com.beelot.game.GameCard.Suit suit) {
    }

    record PrivateTableSessionResponse(PrivateTableResponse table, UUID playerId, UUID playerToken) {
        static PrivateTableSessionResponse from(PrivateTableService.PrivateTableAccess access) {
            return new PrivateTableSessionResponse(PrivateTableResponse.from(access.table()), access.playerId(), access.token());
        }
    }

    record PrivateTableResponse(UUID id, String invitationCode, UUID ownerPlayerId, PrivateTableStatus status,
                                com.beelot.game.GameVariant variant, String variantLabel, int turnTimerSeconds,
                                List<SeatResponse> seats) {
        static PrivateTableResponse from(PrivateTable table) {
            List<SeatResponse> seats = table.seats().stream().map(SeatResponse::from).toList();
            return new PrivateTableResponse(table.id(), table.invitationCode(), table.ownerPlayerId(), table.status(),
                    table.variant(), table.variant().displayName(), table.turnTimerSeconds(), seats);
        }
    }

    record SeatResponse(UUID playerId, String name, boolean ready, String connectionState) {
        static SeatResponse from(PrivateTableSeat seat) {
            return new SeatResponse(seat.playerId(), seat.name(), seat.ready(), seat.connectionState().name());
        }
    }

    record BiddingResponse(List<CardResponse> hand, CardResponse upturnedCard, int round, String activePlayer,
                           boolean playerTurn, String message, com.beelot.game.GameVariant variant,
                           int highestBid, String highestBidSuit, String highestBidder,
                           boolean coincheAllowed, boolean complete) {
        static BiddingResponse from(com.beelot.game.BiddingState.BiddingView bidding) {
            return new BiddingResponse(bidding.hand().stream().map(CardResponse::from).toList(),
                    bidding.upturnedCard() == null ? null : CardResponse.from(bidding.upturnedCard()), bidding.round(),
                    bidding.activePlayer(), bidding.playerTurn(), bidding.message(), bidding.variant(), bidding.highestBid(),
                    bidding.highestBidSuit() == null ? "" : bidding.highestBidSuit().name(), bidding.highestBidder(),
                    bidding.coincheAllowed(), bidding.complete());
        }
    }

    record BoardResponse(List<CardResponse> hand, List<CardResponse> legalCards, List<BoardSeatResponse> seats,
                         String trump, String declaringTeam, String activePlayer, List<CardResponse> currentTrick,
                         int completedTricks, boolean reviewingCompletedTrick, String trickWinner, int trickPoints,
                         int northSouthScore, int eastWestScore, String declarationMessage, int beloteBonusPoints,
                         com.beelot.game.GameBoard.RoundResult roundResult, com.beelot.game.GameVariant variant,
                         int contractValue, boolean coinched) {
        static BoardResponse from(com.beelot.game.GameBoard.GameBoardView board) {
            return new BoardResponse(board.hand().stream().map(CardResponse::from).toList(),
                    board.legalCards().stream().map(CardResponse::from).toList(),
                    board.seats().stream().map(BoardSeatResponse::from).toList(), board.trump(), board.declaringTeam(),
                    board.activePlayer(), board.currentTrick().stream().map(CardResponse::from).toList(),
                    board.completedTricks(), board.reviewingCompletedTrick(), board.trickWinner(), board.trickPoints(),
                    board.northSouthScore(), board.eastWestScore(), board.declarationMessage(), board.beloteBonusPoints(),
                    board.roundResult(), board.variant(), board.contractValue(), board.coinched());
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
}
