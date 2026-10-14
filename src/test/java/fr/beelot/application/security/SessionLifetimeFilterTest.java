package fr.beelot.application.security;

import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class SessionLifetimeFilterTest {

    private static final Instant NOW = Instant.parse("2030-01-31T12:00:00Z");

    private final SessionLifetimeFilter filter = new SessionLifetimeFilter(Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void aSessionSignedInThirtyDaysAgoEnds() throws Exception {
        EndingSession session = new EndingSession();
        session.setAttribute(AccountSessions.SIGNED_IN_AT, NOW.minus(Duration.ofDays(30)));

        HttpServletRequest passedOn = run(session);

        assertThat(session.isInvalid()).isTrue();
        // An end the player did not ask for counts as an expiry (US-083).
        assertThat(session.endedOnPurpose).isFalse();
        assertThat(passedOn.getSession(false)).isNull();
    }

    @Test
    void aYoungerSessionGoesOn() throws Exception {
        MockHttpSession session = signedInAgo(Duration.ofDays(30).minusMinutes(1));

        HttpServletRequest passedOn = run(session);

        assertThat(session.isInvalid()).isFalse();
        assertThat(passedOn.getSession(false)).isSameAs(session);
    }

    @Test
    void aSessionThatNeverSignedInIsLeftAlone() throws Exception {
        MockHttpSession session = new MockHttpSession();

        run(session);

        assertThat(session.isInvalid()).isFalse();
    }

    @Test
    void aRequestWithoutASessionGetsNone() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();

        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(request.getSession(false)).isNull();
    }

    private static MockHttpSession signedInAgo(Duration age) {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(AccountSessions.SIGNED_IN_AT, NOW.minus(age));
        return session;
    }

    private HttpServletRequest run(MockHttpSession session) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSession(session);
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(request, new MockHttpServletResponse(), chain);
        return (HttpServletRequest) chain.getRequest();
    }

    /** Remembers whether the session was marked as ended on purpose when it was invalidated. */
    private static final class EndingSession extends MockHttpSession {

        private boolean endedOnPurpose;

        @Override
        public void invalidate() {
            endedOnPurpose = getAttribute(SecurityEvents.ENDED) != null;
            super.invalidate();
        }
    }
}
