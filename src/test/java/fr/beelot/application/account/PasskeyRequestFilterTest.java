package fr.beelot.application.account;

import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/** Limiting the passkey ceremonies a client IP starts (US-084). */
class PasskeyRequestFilterTest {

    private final SecurityEvents events = mock(SecurityEvents.class);
    private final PasskeyRequestFilter filter = new PasskeyRequestFilter(new PasskeyRateLimiter(Clock.systemUTC(), 1),
            events);

    @Test
    void refusesAboveTheLimitWith429() throws Exception {
        assertThat(send("/api/sign-up/options").getStatus()).isEqualTo(200);

        MockHttpServletResponse refused = send("/webauthn/authenticate/options");

        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(refused.getHeader("Retry-After")).isEqualTo("3600");
    }

    @Test
    void recordsTheRefusal() throws Exception {
        send("/webauthn/authenticate/options");
        send("/webauthn/authenticate/options");

        verify(events).record(Type.RATE_LIMITED, Outcome.REFUSED, null, "203.0.113.7");
    }

    @Test
    void otherPathsPassThrough() throws Exception {
        send("/api/sign-up/options");

        assertThat(send("/login/webauthn").getStatus()).isEqualTo(200);
        assertThat(send("/api/sign-up").getStatus()).isEqualTo(200);
    }

    private MockHttpServletResponse send(String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setRemoteAddr("203.0.113.7");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
