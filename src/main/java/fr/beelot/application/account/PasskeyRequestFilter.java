package fr.beelot.application.account;

import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Keeps a client IP within its limit of passkey ceremonies, counting each time one is started: the sign-up options
 * and the sign-in options. The requests that finish a ceremony are never limited, so a ceremony started is always
 * finished. Not a {@code @Component}: the security chain adds it.
 */
public class PasskeyRequestFilter extends OncePerRequestFilter {

    /**
     * The requests that start a ceremony, matched as Spring Security matches its own URLs: a spelling of the path
     * that reaches the handler, such as one with an encoded letter, must not skip the limit.
     */
    public static final RequestMatcher MATCHER = new OrRequestMatcher(
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/sign-up/options"),
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/webauthn/authenticate/options"));

    private final PasskeyRateLimiter limiter;
    private final SecurityEvents events;

    public PasskeyRequestFilter(PasskeyRateLimiter limiter, SecurityEvents events) {
        this.limiter = limiter;
        this.events = events;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !MATCHER.matches(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (limiter.tryAcquire(request.getRemoteAddr())) {
            chain.doFilter(request, response);
            return;
        }
        events.record(Type.RATE_LIMITED, Outcome.REFUSED, null, request.getRemoteAddr());
        response.setStatus(429);
        response.setHeader("Retry-After", "3600");
    }
}
