package fr.beelot.application.account;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
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

    static final String PATH = "/api/sign-in/link";
    private static final String USERNAME = "username";

    private final SignInRateLimiter limiter;
    private final JsonMapper json;

    public SignInRequestFilter(SignInRateLimiter limiter, JsonMapper json) {
        this.limiter = limiter;
        this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !PATH.equals(request.getRequestURI());
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
            reject(response, 429, "Too many links requested. Please try again later.");
            return;
        }
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
