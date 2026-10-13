package fr.beelot.application.account;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import org.springframework.http.HttpMethod;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Checks a request for a sign-in link before Spring Security generates it: the address must be valid and the client
 * must be within its limits. The request then carries the normalised address as its {@code username}, so that the same
 * address always reaches the same account. Not a {@code @Component}: the security chain adds it.
 */
public class SignInRequestFilter extends OncePerRequestFilter {

    public static final String PATH = "/api/sign-in/link";
    /**
     * The link requests, matched as Spring Security matches its generation URL: a spelling of the path that reaches
     * token generation, such as one with an encoded letter, must not skip these checks.
     */
    public static final RequestMatcher MATCHER =
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, PATH);
    private static final String USERNAME = "username";

    private final SignInRateLimiter limiter;
    private final JsonMapper json;
    private final SecurityEvents events;

    public SignInRequestFilter(SignInRateLimiter limiter, JsonMapper json, SecurityEvents events) {
        this.limiter = limiter;
        this.json = json;
        this.events = events;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !MATCHER.matches(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Optional<String> email = EmailAddresses.normalise(request.getParameter(USERNAME));
        if (email.isEmpty()) {
            reject(response, 400, "Enter a valid email address.");
            return;
        }
        if (!limiter.tryAcquire(email.get(), request.getRemoteAddr())) {
            events.record(Type.RATE_LIMITED, Outcome.REFUSED, null, request.getRemoteAddr());
            reject(response, 429, "Too many links requested. Please try again later.");
            return;
        }
        // No account id: the log, like the answer, never says whether an address has an account.
        events.record(Type.LINK_REQUESTED, Outcome.SUCCESS, null, request.getRemoteAddr());
        chain.doFilter(new NormalisedRequest(request, email.get()), response);
    }

    private void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(json.writeValueAsString(Map.of("message", message)));
    }

    /** The request with its {@code username} replaced by the normalised address. */
    private static final class NormalisedRequest extends HttpServletRequestWrapper {
        private final String email;

        NormalisedRequest(HttpServletRequest request, String email) {
            super(request);
            this.email = email;
        }

        @Override
        public String getParameter(String name) {
            return USERNAME.equals(name) ? email : super.getParameter(name);
        }

        @Override
        public String[] getParameterValues(String name) {
            return USERNAME.equals(name) ? new String[]{email} : super.getParameterValues(name);
        }

        @Override
        public Map<String, String[]> getParameterMap() {
            Map<String, String[]> parameters = new HashMap<>(super.getParameterMap());
            parameters.put(USERNAME, new String[]{email});
            return parameters;
        }
    }
}
