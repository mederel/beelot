package fr.beelot.application.history;

import fr.beelot.application.account.AccountService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Stores each finished match that a signed-in player took part in (US-058). A seat taken by a signed-in player is
 * named after their account, or "Deleted player" with no account once that account is gone. A match is stored once, under its id. The history never stops a game: when it cannot
 * be written, the failure is logged and the match is left out.
 */
@Service
public class MatchHistoryService implements MatchRecorder {

    private static final Logger LOG = LoggerFactory.getLogger(MatchHistoryService.class);

    private final MatchRecordRepository matches;
    private final AccountService accounts;
    private final TransactionTemplate transactions;

    MatchHistoryService(MatchRecordRepository matches, AccountService accounts, TransactionTemplate transactions) {
        this.matches = matches;
        this.accounts = accounts;
        this.transactions = transactions;
    }

    @Override
    public void record(FinishedMatch match) {
        if (!match.hasSignedInPlayer()) return;
        try {
            transactions.executeWithoutResult(status -> store(match));
        } catch (RuntimeException failure) {
            LOG.warn("Could not record match {} in the history", match.id(), failure);
        }
    }

    private void store(FinishedMatch match) {
        if (matches.existsById(match.id())) return;
        List<SeatRecord> seats = new ArrayList<>();
        for (int position = 0; position < match.seats().size(); position++) {
            FinishedMatch.Seat seat = match.seats().get(position);
            UUID accountId = seat.accountId();
            String name = seat.name();
            if (accountId != null) {
                // The account may have been deleted while the match was played: the seat is then anonymous.
                Optional<String> displayName = accounts.displayName(accountId);
                name = displayName.orElse(FinishedMatch.DELETED_PLAYER);
                if (displayName.isEmpty()) accountId = null;
            }
            seats.add(new SeatRecord(accountId, name, Team.of(FinishedMatch.team(position)), seat.bot()));
        }
        matches.save(new MatchRecord(match, seats));
    }
}
