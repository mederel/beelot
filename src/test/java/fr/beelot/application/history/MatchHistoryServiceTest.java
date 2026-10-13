package fr.beelot.application.history;

import fr.beelot.application.account.AccountService;
import fr.beelot.game.GameVariant;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchHistoryServiceTest {

    private final MatchRecordRepository matches = Mockito.mock(MatchRecordRepository.class);
    private final AccountService accounts = Mockito.mock(AccountService.class);
    private final MatchHistoryService history = new MatchHistoryService(matches, accounts,
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

    @Test
    void matchFinishedAfterDeletionIsRecordedAnonymously() {
        UUID deleted = UUID.randomUUID();
        when(accounts.displayName(deleted)).thenReturn(Optional.empty());

        history.record(match(deleted));

        ArgumentCaptor<MatchRecord> saved = ArgumentCaptor.forClass(MatchRecord.class);
        verify(matches).save(saved.capture());
        SeatRecord seat = saved.getValue().seats().getFirst();
        assertNull(seat.accountId());
        assertEquals("Deleted player", seat.name());
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
