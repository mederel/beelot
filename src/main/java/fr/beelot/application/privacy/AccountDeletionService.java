package fr.beelot.application.privacy;

import fr.beelot.application.history.FinishedMatch;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import fr.beelot.application.privategame.PrivateTableService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Optional;
import java.util.UUID;

/**
 * Deletes an account and everything Beelot keeps about it (US-081): its email address, pending sign-in links and
 * security events, and, by cascade, a pending change of address (US-079). Finished matches stay in the other players' history, with the account's seats renamed "Deleted
 * player" and linked to no account. Once that is committed, the account's live table seats go to bots, its sessions
 * end, and an anonymous deletion event is recorded; a failure in those steps is logged and does not undo the deletion.
 */
@Service
public class AccountDeletionService {

    public static final String DELETED_PLAYER = FinishedMatch.DELETED_PLAYER;

    private static final Logger LOG = LoggerFactory.getLogger(AccountDeletionService.class);

    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final AccountSessions sessions;
    private final PrivateTableService privateTables;
    private final SecurityEvents events;

    AccountDeletionService(JdbcClient jdbc, TransactionTemplate transactions, AccountSessions sessions,
                           PrivateTableService privateTables, SecurityEvents events) {
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.sessions = sessions;
        this.privateTables = privateTables;
        this.events = events;
    }

    /** Deletes the account, as the retention job does: no client IP address. */
    public void delete(UUID accountId) {
        delete(accountId, null);
    }

    /** Deletes the account at the request of a client with the given IP address. */
    public void delete(UUID accountId, String ip) {
        String id = accountId.toString();
        transactions.executeWithoutResult(status -> {
            Optional<String> email = jdbc.sql("SELECT email FROM account_email WHERE account_id = ?").param(id)
                    .query(String.class).optional();
            jdbc.sql("UPDATE match_seat SET account_id = NULL, name = ? WHERE account_id = ?")
                    .params(DELETED_PLAYER, id).update();
            jdbc.sql("DELETE FROM security_event WHERE account_id = ?").param(id).update();
            email.ifPresent(address -> jdbc.sql("DELETE FROM sign_in_token WHERE email = ?").param(address).update());
            jdbc.sql("DELETE FROM account_email WHERE account_id = ?").param(id).update();
            jdbc.sql("DELETE FROM account WHERE id = ?").param(id).update();
        });
        afterDeletion("give the account's table seats to bots", () -> privateTables.releaseAccount(accountId, DELETED_PLAYER));
        afterDeletion("end the account's sessions", () -> sessions.invalidateAll(accountId));
        events.record(Type.DELETION, Outcome.SUCCESS, null, ip);
    }

    private static void afterDeletion(String step, Runnable action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            LOG.warn("An account was deleted, but Beelot could not {}", step, e);
        }
    }
}
