package fr.beelot.application.privacy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.session.HttpSessionDestroyedEvent;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AccountSessionsTest {

    private static final Instant NOW = Instant.parse("2030-01-01T12:00:00Z");

    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final AccountSessions sessions = new AccountSessions(clock);

    @Test
    void invalidateAllEndsEverySessionOfTheAccount() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        MockHttpSession first = new MockHttpSession();
        MockHttpSession second = new MockHttpSession();
        MockHttpSession other = new MockHttpSession();
        sessions.signedIn(a, first);
        sessions.signedIn(a, second);
        sessions.signedIn(b, other);

        sessions.invalidateAll(a);

        assertThat(first.isInvalid()).isTrue();
        assertThat(second.isInvalid()).isTrue();
        assertThat(other.isInvalid()).isFalse();
        assertThat(other.getAttribute(SecurityEvents.ENDED)).isNull();
    }

    @Test
    void invalidatedSessionsAreMarkedEndedFirst() {
        UUID a = UUID.randomUUID();
        MockHttpSession session = new MockHttpSession() {
            @Override
            public void invalidate() {
                assertThat(getAttribute(SecurityEvents.ENDED)).isEqualTo(true);
                super.invalidate();
            }
        };
        sessions.signedIn(a, session);

        sessions.invalidateAll(a);

        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void anAlreadyInvalidSessionIsSkipped() {
        UUID a = UUID.randomUUID();
        MockHttpSession gone = new MockHttpSession();
        MockHttpSession live = new MockHttpSession();
        sessions.signedIn(a, gone);
        sessions.signedIn(a, live);
        gone.invalidate();

        sessions.invalidateAll(a);

        assertThat(live.isInvalid()).isTrue();
    }

    @Test
    void destroyedSessionIsForgotten() {
        UUID a = UUID.randomUUID();
        MockHttpSession session = new MockHttpSession();
        sessions.signedIn(a, session);

        sessions.sessionDestroyed(new HttpSessionDestroyedEvent(session));
        sessions.invalidateAll(a);

        assertThat(session.isInvalid()).isFalse();
    }

    @Test
    void signInStoresTheTime() {
        MockHttpSession session = new MockHttpSession();

        sessions.signedIn(UUID.randomUUID(), session);

        assertThat(session.getAttribute(AccountSessions.SIGNED_IN_AT)).isEqualTo(NOW);
    }

    @Test
    void signInNineMinutesAgoIsRecent() {
        assertThat(AccountSessions.signedInRecently(signedInAgo(Duration.ofMinutes(9)), clock)).isTrue();
    }

    @Test
    void signInTenMinutesOldMustReauthenticate() {
        assertThat(AccountSessions.signedInRecently(signedInAgo(Duration.ofMinutes(10)), clock)).isFalse();
    }

    @Test
    void noSignInTimeIsNotRecent() {
        assertThat(AccountSessions.signedInRecently(new MockHttpSession(), clock)).isFalse();
    }

    private static MockHttpSession signedInAgo(Duration age) {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(AccountSessions.SIGNED_IN_AT, NOW.minus(age));
        return session;
    }
}
