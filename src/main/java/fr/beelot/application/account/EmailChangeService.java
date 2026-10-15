package fr.beelot.application.account;

import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.PrivacyProperties;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Moves an email account to a new address (US-079). The new address receives a link, with the rules of a sign-in link
 * (US-075); the account keeps its old address until the link is confirmed. An address that already has an account
 * receives a notice instead, so the answer never says whether an address has an account. Confirming tells the old
 * address and ends every session of the account, whose sessions still hold the old address.
 */
@Service
public class EmailChangeService {

    private static final Logger LOG = LoggerFactory.getLogger(EmailChangeService.class);
    private static final Duration PURGE_AFTER = Duration.ofDays(1);

    /** The outcome of a request; {@link Sent} for a free and a taken address alike. */
    public sealed interface RequestResult permits Sent, InvalidAddress, SameAddress, RateLimited, MailFailed {
    }

    public record Sent() implements RequestResult {
    }

    public record InvalidAddress() implements RequestResult {
    }

    public record SameAddress() implements RequestResult {
    }

    public record RateLimited() implements RequestResult {
    }

    public record MailFailed() implements RequestResult {
    }

    /** A confirmed change: the account now signs in with the new address. */
    public record Confirmed(UUID accountId, String newEmail) {
    }

    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final AccountService accounts;
    private final SignInRateLimiter limiter;
    private final AccountSessions sessions;
    private final SecurityEvents events;
    private final JavaMailSender mail;
    private final PrivacyProperties privacy;
    private final Clock clock;
    private final String publicUrl;
    private final String from;
    private final Duration lifetime;

    EmailChangeService(JdbcClient jdbc, TransactionTemplate transactions, AccountService accounts,
                       SignInRateLimiter limiter, AccountSessions sessions, SecurityEvents events,
                       JavaMailSender mail, PrivacyProperties privacy, Clock clock,
                       @Value("${beelot.public-url}") String publicUrl, @Value("${beelot.mail.from}") String from,
                       @Value("${beelot.sign-in.link-lifetime:PT15M}") Duration lifetime) {
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.accounts = accounts;
        this.limiter = limiter;
        this.sessions = sessions;
        this.events = events;
        this.mail = mail;
        this.privacy = privacy;
        this.clock = clock;
        this.publicUrl = publicUrl.endsWith("/") ? publicUrl.substring(0, publicUrl.length() - 1) : publicUrl;
        this.from = from;
        this.lifetime = lifetime;
    }

    /** Sends the new address a link, or a notice if another account has it; earlier links of the account stop working. */
    public RequestResult request(UUID accountId, String newEmail, Locale locale, String ip) {
        Optional<String> normalised = EmailAddresses.normalise(newEmail);
        if (normalised.isEmpty()) {
            return new InvalidAddress();
        }
        String address = normalised.get();
        if (accounts.email(accountId).filter(address::equals).isPresent()) {
            return new SameAddress();
        }
        if (!limiter.tryAcquire(address, ip)) {
            events.record(Type.RATE_LIMITED, Outcome.REFUSED, accountId, ip);
            return new RateLimited();
        }
        String id = accountId.toString();
        String token = Tokens.newToken();
        boolean taken = Boolean.TRUE.equals(transactions.execute(status -> {
            jdbc.sql("DELETE FROM email_change_token WHERE account_id = ?").param(id).update();
            if (jdbc.sql("SELECT COUNT(*) FROM account_email WHERE email = ?").param(address)
                    .query(Long.class).single() > 0) {
                return true;
            }
            jdbc.sql("INSERT INTO email_change_token (token_hash, account_id, new_email, expires_at) "
                            + "VALUES (?, ?, ?, ?)")
                    .params(Tokens.hash(token), id, address, toUtc(clock.instant().plus(lifetime)))
                    .update();
            return false;
        }));
        EmailChangeEmail email = taken
                ? EmailChangeEmail.taken(locale)
                : EmailChangeEmail.link(locale, publicUrl + "/settings/email?token=" + token);
        try {
            send(address, email);
        } catch (MailException failure) {
            LOG.warn("Could not send an email change link: {}", failure.getClass().getName());
            jdbc.sql("DELETE FROM email_change_token WHERE token_hash = ?").param(Tokens.hash(token)).update();
            return new MailFailed();
        }
        events.record(Type.EMAIL_CHANGE_REQUESTED, Outcome.SUCCESS, accountId, ip);
        return new Sent();
    }

    /**
     * Spends the token and moves its account to the new address, unless the token is unknown, spent or expired, or
     * another account has taken the address since. Then tells the old address and ends the account's sessions.
     */
    public Optional<Confirmed> confirm(String token, Locale locale, String ip) {
        Optional<Change> change = token == null || token.isBlank() ? Optional.empty() : move(Tokens.hash(token));
        if (change.isEmpty()) {
            // Like a failed sign-in, with no account: guessing links shows in the log.
            events.record(Type.EMAIL_CHANGED, Outcome.FAILURE, null, ip);
            return Optional.empty();
        }
        Change done = change.get();
        try {
            send(done.oldEmail(), EmailChangeEmail.changed(locale, done.newEmail(), privacy.contact()));
        } catch (MailException failure) {
            LOG.warn("Could not tell the old address of an email change: {}", failure.getClass().getName());
        }
        events.record(Type.EMAIL_CHANGED, Outcome.SUCCESS, done.accountId(), ip);
        sessions.invalidateAll(done.accountId());
        return Optional.of(new Confirmed(done.accountId(), done.newEmail()));
    }

    /** Spends the token with the given hash and moves its account to the new address, in one transaction. */
    private Optional<Change> move(String hash) {
        try {
            Optional<Change> change = transactions.execute(status -> {
                Optional<Pending> pending = jdbc.sql(
                                "SELECT account_id, new_email, expires_at FROM email_change_token WHERE token_hash = ?")
                        .param(hash)
                        .query((rs, n) -> new Pending(UUID.fromString(rs.getString("account_id")),
                                rs.getString("new_email"),
                                rs.getObject("expires_at", LocalDateTime.class).toInstant(ZoneOffset.UTC)))
                        .optional();
                if (pending.isEmpty()) {
                    return Optional.empty();
                }
                int deleted = jdbc.sql("DELETE FROM email_change_token WHERE token_hash = ?").param(hash).update();
                Pending found = pending.get();
                if (deleted != 1 || !found.expiresAt().isAfter(clock.instant())) {
                    return Optional.empty();
                }
                String id = found.accountId().toString();
                Optional<String> oldEmail = jdbc.sql("SELECT email FROM account_email WHERE account_id = ?")
                        .param(id).query(String.class).optional();
                if (oldEmail.isEmpty() || jdbc.sql("SELECT COUNT(*) FROM account_email WHERE email = ?")
                        .param(found.newEmail()).query(Long.class).single() > 0) {
                    return Optional.empty();
                }
                jdbc.sql("UPDATE account_email SET email = ? WHERE account_id = ?")
                        .params(found.newEmail(), id).update();
                return Optional.of(new Change(found.accountId(), oldEmail.get(), found.newEmail()));
            });
            return change == null ? Optional.empty() : change;
        } catch (DuplicateKeyException taken) {
            // Another account took the address between the check and the update.
            return Optional.empty();
        }
    }

    /** Removes tokens that expired more than a day ago; returns how many. */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT1M")
    int purgeExpired() {
        int deleted = jdbc.sql("DELETE FROM email_change_token WHERE expires_at < ?")
                .param(toUtc(clock.instant().minus(PURGE_AFTER)))
                .update();
        if (deleted > 0) {
            LOG.info("Purged {} expired email change tokens", deleted);
        }
        return deleted;
    }

    private void send(String to, EmailChangeEmail email) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject(email.subject());
        message.setText(email.body());
        mail.send(message);
    }

    private static LocalDateTime toUtc(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private record Pending(UUID accountId, String newEmail, Instant expiresAt) {
    }

    private record Change(UUID accountId, String oldEmail, String newEmail) {
    }
}
