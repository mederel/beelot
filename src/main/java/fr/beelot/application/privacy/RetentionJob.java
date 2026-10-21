package fr.beelot.application.privacy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * Enforces the retention periods of the privacy policy every night (US-083): security events are kept 12 months,
 * and accounts 3 years after their last sign-in. Each account is handled on its own, so one failure leaves the others
 * unaffected. Passkeys left by sign-ups that never finished go after a day.
 */
@Component
public class RetentionJob {

    private static final Logger LOG = LoggerFactory.getLogger(RetentionJob.class);
    private static final Duration EVENT_RETENTION = Duration.ofDays(365);
    private static final int ACCOUNT_RETENTION_YEARS = 3;
    private static final Duration ABANDONED_SIGN_UP = Duration.ofDays(1);

    private final JdbcClient jdbc;
    private final AccountDeletionService deletion;
    private final Clock clock;

    public RetentionJob(JdbcClient jdbc, AccountDeletionService deletion, Clock clock) {
        this.jdbc = jdbc;
        this.deletion = deletion;
        this.clock = clock;
    }

    @Scheduled(cron = "${beelot.privacy.retention-cron:0 30 3 * * *}", zone = "UTC")
    public void run() {
        Instant now = clock.instant();
        purgeEvents(utc(now.minus(EVENT_RETENTION)));
        delete(utc(now.atZone(ZoneOffset.UTC).minusYears(ACCOUNT_RETENTION_YEARS).toInstant()));
        purgeAbandonedSignUps(utc(now.minus(ABANDONED_SIGN_UP)));
    }

    private void purgeEvents(LocalDateTime before) {
        try {
            int purged = jdbc.sql("DELETE FROM security_event WHERE occurred_at < ?").param(before).update();
            if (purged > 0) LOG.info("Purged {} security events older than 12 months", purged);
        } catch (RuntimeException e) {
            LOG.warn("Could not purge the old security events", e);
        }
    }

    /** Deletes the accounts that have not signed in since the given time. */
    private void delete(LocalDateTime inactiveSince) {
        List<String> due = jdbc.sql("SELECT id FROM account WHERE last_sign_in_at <= ?")
                .param(inactiveSince)
                .query(String.class).list();
        for (String id : due) {
            try {
                deletion.delete(UUID.fromString(id));
            } catch (RuntimeException e) {
                LOG.warn("Could not delete an inactive account", e);
            }
        }
        if (!due.isEmpty()) LOG.info("Deleted {} accounts inactive for 3 years", due.size());
    }

    /** Deletes the WebAuthn users, and by cascade their passkeys, that no account has claimed. */
    private void purgeAbandonedSignUps(LocalDateTime before) {
        try {
            int purged = jdbc.sql("DELETE FROM user_entities WHERE created_at < ? "
                            + "AND NOT EXISTS (SELECT 1 FROM account a WHERE a.id = user_entities.name)")
                    .param(before).update();
            if (purged > 0) LOG.info("Purged {} passkeys of sign-ups never finished", purged);
        } catch (RuntimeException e) {
            LOG.warn("Could not purge the passkeys of sign-ups never finished", e);
        }
    }

    private static LocalDateTime utc(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
