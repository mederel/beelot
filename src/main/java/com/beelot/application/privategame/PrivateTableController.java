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
        return PrivateTableSessionResponse.from(privateTableService.create(request.playerName()));
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

    @ExceptionHandler(PrivateTableConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ErrorResponse conflict(PrivateTableConflictException exception) {
        return new ErrorResponse(exception.getMessage());
    }

    record CreatePrivateTableRequest(String playerName) {
    }

    record JoinPrivateTableRequest(String invitationCode, String playerName) {
    }

    record PlayerTokenRequest(UUID playerToken) {
    }

    record ReadyRequest(UUID playerToken, boolean ready) {
    }

    record PrivateTableSessionResponse(PrivateTableResponse table, UUID playerId, UUID playerToken) {
        static PrivateTableSessionResponse from(PrivateTableService.PrivateTableAccess access) {
            return new PrivateTableSessionResponse(PrivateTableResponse.from(access.table()), access.playerId(), access.token());
        }
    }

    record PrivateTableResponse(UUID id, String invitationCode, UUID ownerPlayerId, PrivateTableStatus status,
                                List<SeatResponse> seats) {
        static PrivateTableResponse from(PrivateTable table) {
            List<SeatResponse> seats = table.seats().stream().map(SeatResponse::from).toList();
            return new PrivateTableResponse(table.id(), table.invitationCode(), table.ownerPlayerId(), table.status(), seats);
        }
    }

    record SeatResponse(UUID playerId, String name, boolean ready) {
        static SeatResponse from(PrivateTableSeat seat) {
            return new SeatResponse(seat.playerId(), seat.name(), seat.ready());
        }
    }

    record ErrorResponse(String message) {
    }
}
