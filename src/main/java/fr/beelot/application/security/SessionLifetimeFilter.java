package fr.beelot.application.security;

import fr.beelot.application.privacy.AccountSessions;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Ends a signed-in session 30 days after its sign-in, however active it is (US-077); a session idle for 7 days ends
 * sooner, through the servlet container's timeout. It runs before the security context is read from the session, so
 * the request goes on as a guest's. The end is not marked as asked for, so it is recorded as an expiry (US-083).
 */
public class SessionLifetimeFilter extends OncePerRequestFilter {

    static final Duration MAX_LIFETIME = Duration.ofDays(30);

    private final Clock clock;

    public SessionLifetimeFilter(Clock clock) {
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpSession session = request.getSession(false);
        if (session != null && session.getAttribute(AccountSessions.SIGNED_IN_AT) instanceof Instant signedInAt
                && !signedInAt.plus(MAX_LIFETIME).isAfter(clock.instant())) {
            try {
                session.invalidate();
            } catch (IllegalStateException alreadyInvalid) {
                // Ended in the meantime.
            }
        }
        chain.doFilter(request, response);
    }
}
