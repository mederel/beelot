package fr.beelot.application.history;

import fr.beelot.application.account.AccountService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/** The signed-in player's own statistics; guests are asked to sign in. */
@RestController
class StatisticsController {

    private final AccountService accounts;
    private final MatchRecordRepository matches;

    StatisticsController(AccountService accounts, MatchRecordRepository matches) {
        this.accounts = accounts;
        this.matches = matches;
    }

    @GetMapping("/api/statistics")
    @Transactional(readOnly = true)
    ResponseEntity<?> statistics(Authentication authentication) {
        UUID accountId = accounts.currentId(authentication);
        if (accountId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Sign in to see your statistics."));
        }
        return ResponseEntity.ok(PlayerStatistics.of(accountId, matches.findPlayedBy(accountId)));
    }
}
