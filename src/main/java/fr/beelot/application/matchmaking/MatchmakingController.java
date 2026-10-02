package fr.beelot.application.matchmaking;

import fr.beelot.application.privategame.PrivateTableController.ErrorResponse;
import fr.beelot.application.privategame.PrivateTableController.PrivateTableSessionResponse;
import fr.beelot.game.GameVariant;
import fr.beelot.game.PrivateTableConflictException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/matchmaking")
class MatchmakingController {

    private final MatchmakingService matchmakingService;

    MatchmakingController(MatchmakingService matchmakingService) {
        this.matchmakingService = matchmakingService;
    }

    @PostMapping("/quick-match")
    @ResponseStatus(HttpStatus.CREATED)
    PrivateTableSessionResponse quickMatch(@RequestBody QuickMatchRequest request) {
        return PrivateTableSessionResponse.from(matchmakingService.quickMatch(request.playerName(), request.variant()));
    }

    @ExceptionHandler(PrivateTableConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ErrorResponse conflict(PrivateTableConflictException exception) {
        return new ErrorResponse(exception.getMessage());
    }

    record QuickMatchRequest(String playerName, GameVariant variant) {
    }
}
