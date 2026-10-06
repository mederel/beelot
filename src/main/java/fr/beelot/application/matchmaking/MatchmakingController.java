package fr.beelot.application.matchmaking;

import fr.beelot.application.account.AccountService;
import fr.beelot.application.privategame.PrivateTableController.ErrorResponse;
import fr.beelot.application.privategame.PrivateTableController.PrivateTableSessionResponse;
import fr.beelot.game.GameVariant;
import fr.beelot.game.PrivateTableConflictException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
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
    private final AccountService accounts;

    MatchmakingController(MatchmakingService matchmakingService, AccountService accounts) {
        this.matchmakingService = matchmakingService;
        this.accounts = accounts;
    }

    @PostMapping("/quick-match")
    @ResponseStatus(HttpStatus.CREATED)
    PrivateTableSessionResponse quickMatch(@RequestBody QuickMatchRequest request, Authentication authentication) {
        return PrivateTableSessionResponse.from(matchmakingService.quickMatch(request.playerName(), request.variant(),
                accounts.currentId(authentication)));
    }

    @ExceptionHandler(PrivateTableConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ErrorResponse conflict(PrivateTableConflictException exception) {
        return new ErrorResponse(exception.getMessage());
    }

    record QuickMatchRequest(String playerName, GameVariant variant) {
    }
}
