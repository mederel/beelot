package fr.beelot.application.privacy;

import fr.beelot.application.security.HourlyIpLimiter;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.web.session.HttpSessionDestroyedEvent;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * The security event log (US-083): sign-ups, sign-ins, failed sign-ins, sign-outs, expired sessions, rate-limit
 * refusals, exports and deletions, each with the account when known, the time, the client's IP address and the
 * outcome. No passkey credential id or challenge is ever recorded. Recording never blocks the action that is recorded: a failed insert is logged and ignored.
 */
@Component
public class SecurityEvents {

    /** The session attribute holding the signed-in account's {@link UUID}. */
    public static final String ACCOUNT_ID = "beelot.accountId";
    /** Set to {@code true} before Beelot itself ends a session, so that its end is not recorded as an expiry. */
    public static final String ENDED = "beelot.ended";

    private static final Logger LOG = LoggerFactory.getLogger(SecurityEvents.class);

    public enum Type { SIGN_UP, SIGN_IN, SIGN_OUT, SESSION_EXPIRED, RATE_LIMITED, EXPORT, DELETION }

    public enum Outcome { SUCCESS, FAILURE, REFUSED }

    /** Anonymous events kept per hour from all IPs together, whatever the limit per IP. */
    private static final int ANONYMOUS_LIMIT = 10_000;

    private final JdbcClient jdbc;
    private final Clock clock;
    private final HourlyIpLimiter anonymousPerIp;
    private final HourlyIpLimiter anonymous;

    public SecurityEvents(JdbcClient jdbc, Clock clock,
                          @Value("${beelot.security-events.anonymous-limit-per-ip}") int anonymousLimitPerIp) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.anonymousPerIp = new HourlyIpLimiter(clock, anonymousLimitPerIp);
        this.anonymous = new HourlyIpLimiter(clock, ANONYMOUS_LIMIT);
    }

    /**
     * Records one event; never throws. An event without an account, which anyone can cause with a failed sign-in or
     * sign-up, is dropped beyond an hourly limit per IP and overall, so that it cannot fill the table. Deletions,
     * anonymous once the account is gone, are always recorded.
     */
    public void record(Type type, Outcome outcome, UUID accountIdOrNull, String ipOrNull) {
        if (accountIdOrNull == null && type != Type.DELETION && !anonymousAllowed(ipOrNull)) {
            LOG.debug("Dropped the anonymous security event {} {} over the limit", type, outcome);
            return;
        }
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

    private boolean anonymousAllowed(String ipOrNull) {
        return anonymousPerIp.tryAcquire(ipOrNull == null ? "unknown" : ipOrNull) && anonymous.tryAcquire("all");
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
