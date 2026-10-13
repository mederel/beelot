package fr.beelot.application.privacy;

import jakarta.servlet.http.HttpSession;
import org.springframework.context.event.EventListener;
import org.springframework.security.web.session.HttpSessionDestroyedEvent;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The live sessions of each account, so that deleting an account signs it out everywhere (US-081), and the time each
 * session last signed in, so that deletion can ask for a recent sign-in.
 */
@Component
public class AccountSessions {

    /** The session attribute holding the {@link Instant} of the session's last successful sign-in. */
    public static final String SIGNED_IN_AT = "beelot.signedInAt";
    private static final Duration RECENT = Duration.ofMinutes(10);

    private final Map<UUID, Set<HttpSession>> sessions = new ConcurrentHashMap<>();
    private final Clock clock;

    public AccountSessions(Clock clock) {
        this.clock = clock;
    }

    /** Remembers a session that has just signed in to the account. */
    public void signedIn(UUID accountId, HttpSession session) {
        session.setAttribute(SIGNED_IN_AT, clock.instant());
        sessions.computeIfAbsent(accountId, id -> ConcurrentHashMap.newKeySet()).add(session);
    }

    /** Ends every live session of the account. */
    public void invalidateAll(UUID accountId) {
        Set<HttpSession> live = sessions.remove(accountId);
        if (live == null) {
            return;
        }
        for (HttpSession session : live) {
            try {
                session.setAttribute(SecurityEvents.ENDED, true);
                session.invalidate();
            } catch (IllegalStateException alreadyInvalid) {
                // Ended in the meantime: nothing left to do.
            }
        }
    }

    @EventListener
    void sessionDestroyed(HttpSessionDestroyedEvent event) {
        HttpSession session = event.getSession();
        sessions.values().forEach(live -> live.remove(session));
        sessions.values().removeIf(Set::isEmpty);
    }

    /** Whether the session signed in less than 10 minutes ago. */
    public static boolean signedInRecently(HttpSession session, Clock clock) {
        return session.getAttribute(SIGNED_IN_AT) instanceof Instant signedInAt
                && signedInAt.isAfter(clock.instant().minus(RECENT));
    }
}
