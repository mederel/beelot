package fr.beelot.application.account;

import jakarta.servlet.http.Cookie;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Sends the CSRF token as the browser client does: in the {@code XSRF-TOKEN} cookie and the {@code X-XSRF-TOKEN}
 * header. Spring's {@code csrf()} post-processor would instead swap the application's cookie token repository for a
 * session one, for the whole test context, so that every later request creates a session and needs the token.
 */
public final class BrowserCsrf {

    private static final String TOKEN = "5f0c9a2e-test-csrf-token";

    private BrowserCsrf() {
    }

    /** The token, in the cookie and the header. */
    public static RequestPostProcessor csrfToken() {
        return request -> {
            request.setCookies(new Cookie("XSRF-TOKEN", TOKEN));
            request.addHeader("X-XSRF-TOKEN", TOKEN);
            return request;
        };
    }

    /** The value of the token that {@link #csrfToken()} sends. */
    public static String value() {
        return TOKEN;
    }
}
