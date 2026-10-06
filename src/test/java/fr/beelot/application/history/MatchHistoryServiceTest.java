package fr.beelot.application.history;

import fr.beelot.application.account.AccountService;
import fr.beelot.game.GameVariant;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchHistoryServiceTest {

    private final MatchRecordRepository matches = Mockito.mock(MatchRecordRepository.class);
    private final MatchHistoryService history = new MatchHistoryService(matches, Mockito.mock(AccountService.class),
            new TransactionTemplate(new NoTransactions()));

    @Test
    void aMatchWithoutASignedInPlayerIsNotStored() {
        history.record(match(null));

        verify(matches, never()).save(any());
    }

    @Test
    void aDatabaseFailureNeverStopsTheGame() {
        when(matches.existsById(any())).thenThrow(new DataAccessResourceFailureException("database down"));

        assertDoesNotThrow(() -> history.record(match(UUID.randomUUID())));
    }

    private static FinishedMatch match(UUID accountId) {
        return new FinishedMatch(UUID.randomUUID(), Instant.now(), FinishedMatch.Mode.SOLO, GameVariant.CLASSIC, null,
                1_010, 600, "North–South", List.of(new FinishedMatch.Seat(accountId, "You", false),
                new FinishedMatch.Seat(null, "Camille", true), new FinishedMatch.Seat(null, "Luc", true),
                new FinishedMatch.Seat(null, "Manon", true)), List.of());
    }

    /** Runs the work without a database transaction. */
    private static final class NoTransactions extends AbstractPlatformTransactionManager {

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}
