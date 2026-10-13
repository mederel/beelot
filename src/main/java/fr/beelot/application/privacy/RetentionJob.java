package fr.beelot.application.privacy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * Enforces the retention periods of the privacy policy every night (US-083): security events are kept 12 months,
 * and accounts 3 years after their last sign-in. Email-link players are warned by email 30 days before their account
 * is deleted; the 30 days count from the warning actually sent. Each account is handled on its own, so one failure
 * leaves the others unaffected. Expired sign-in tokens are purged every hour by {@code SignInTokenService}.
 */
@Component
public class RetentionJob {

    private static final Logger LOG = LoggerFactory.getLogger(RetentionJob.class);
    private static final Duration EVENT_RETENTION = Duration.ofDays(365);
    private static final int ACCOUNT_RETENTION_YEARS = 3;
    private static final Duration WARNING_NOTICE = Duration.ofDays(30);

    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final AccountDeletionService deletion;
    private final JavaMailSender mail;
    private final Clock clock;
    private final String from;
    private final String publicUrl;

    public RetentionJob(JdbcClient jdbc, TransactionTemplate transactions, AccountDeletionService deletion,
                        JavaMailSender mail, Clock clock, @Value("${beelot.mail.from}") String from,
                        @Value("${beelot.public-url}") String publicUrl) {
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.deletion = deletion;
        this.mail = mail;
        this.clock = clock;
        this.from = from;
        this.publicUrl = publicUrl;
    }

    @Scheduled(cron = "${beelot.privacy.retention-cron:0 30 3 * * *}", zone = "UTC")
    public void run() {
        Instant now = clock.instant();
        LocalDateTime inactiveSince = utc(now.atZone(ZoneOffset.UTC).minusYears(ACCOUNT_RETENTION_YEARS).toInstant());
        LocalDateTime warnFrom = inactiveSince.plus(WARNING_NOTICE);
        purgeEvents(utc(now.minus(EVENT_RETENTION)));
        warn(warnFrom, utc(now));
        delete(inactiveSince, utc(now.minus(WARNING_NOTICE)));
    }

    private void purgeEvents(LocalDateTime before) {
        try {
            int purged = jdbc.sql("DELETE FROM security_event WHERE occurred_at < ?").param(before).update();
            if (purged > 0) LOG.info("Purged {} security events older than 12 months", purged);
        } catch (RuntimeException e) {
            LOG.warn("Could not purge the old security events", e);
        }
    }

    /** Warns each email-link account inactive for 3 years less 30 days, once; a failed email is retried next night. */
    private void warn(LocalDateTime inactiveSince, LocalDateTime now) {
        List<Warning> due = jdbc.sql("SELECT a.id, e.email FROM account a JOIN account_email e ON e.account_id = a.id "
                        + "WHERE a.last_sign_in_at <= ? AND a.deletion_warned_at IS NULL")
                .param(inactiveSince)
                .query((row, number) -> new Warning(row.getString(1), row.getString(2))).list();
        InactivityWarningEmail email = InactivityWarningEmail.of(publicUrl);
        for (Warning warning : due) {
            try {
                SimpleMailMessage message = new SimpleMailMessage();
                message.setFrom(from);
                message.setTo(warning.email());
                message.setSubject(email.subject());
                message.setText(email.body());
                mail.send(message);
                // A sign-in since the query has cleared the warning's reason: leave the account unwarned.
                transactions.executeWithoutResult(status -> jdbc.sql("UPDATE account SET deletion_warned_at = ? "
                                + "WHERE id = ? AND deletion_warned_at IS NULL AND last_sign_in_at <= ?")
                        .params(now, warning.accountId(), inactiveSince).update());
            } catch (RuntimeException e) {
                LOG.warn("Could not warn an inactive account before its deletion; retrying next night: {}",
                        e.getClass().getName());
            }
        }
    }

    /** Deletes accounts inactive for 3 years that have no email address, or were warned at least 30 days ago. */
    private void delete(LocalDateTime inactiveSince, LocalDateTime warnedBefore) {
        List<String> due = jdbc.sql("SELECT a.id FROM account a LEFT JOIN account_email e ON e.account_id = a.id "
                        + "WHERE a.last_sign_in_at <= ? AND (e.account_id IS NULL OR a.deletion_warned_at <= ?)")
                .params(inactiveSince, warnedBefore)
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

    private static LocalDateTime utc(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private record Warning(String accountId, String email) {
    }
}
