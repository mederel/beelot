package fr.beelot.application.privacy;

import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.web.session.HttpSessionDestroyedEvent;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * The security event log (US-083): link requests, sign-ins, sign-outs, expired sessions, rate-limit refusals, exports
 * and deletions, each with the account when known, the time, the client's IP address and the outcome. A token never
 * reaches this log. Recording never blocks the action that is recorded: a failed insert is logged and ignored.
 */
@Component
public class SecurityEvents {

    /** The session attribute holding the signed-in account's {@link UUID}. */
    public static final String ACCOUNT_ID = "beelot.accountId";
    /** Set to {@code true} before Beelot itself ends a session, so that its end is not recorded as an expiry. */
    public static final String ENDED = "beelot.ended";

    private static final Logger LOG = LoggerFactory.getLogger(SecurityEvents.class);

    public enum Type { LINK_REQUESTED, SIGN_IN, SIGN_OUT, SESSION_EXPIRED, RATE_LIMITED, EXPORT, DELETION }

    public enum Outcome { SUCCESS, FAILURE, REFUSED }

    private final JdbcClient jdbc;
    private final Clock clock;

    public SecurityEvents(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Records one event; never throws. */
    public void record(Type type, Outcome outcome, UUID accountIdOrNull, String ipOrNull) {
        try {
            jdbc.sql("INSERT INTO security_event (account_id, type, outcome, ip_address, occurred_at) "
                            + "VALUES (?, ?, ?, ?, ?)")
                    .params(accountIdOrNull == null ? null : accountIdOrNull.toString(), type.name(), outcome.name(),
                            ipOrNull, LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC))
                    .update();
        } catch (RuntimeException e) {
            LOG.warn("Could not record the security event {} {}", type, outcome, e);
        }
    }

    /** A session of a signed-in player that the container ends, rather than Beelot, has expired. */
    @EventListener
    void sessionDestroyed(HttpSessionDestroyedEvent event) {
        HttpSession session = event.getSession();
        try {
            if (session.getAttribute(ACCOUNT_ID) instanceof UUID account
                    && !Boolean.TRUE.equals(session.getAttribute(ENDED))) {
                record(Type.SESSION_EXPIRED, Outcome.SUCCESS, account, null);
            }
        } catch (IllegalStateException alreadyInvalid) {
            // Nothing can be read from a session that is already gone.
        }
    }
}
