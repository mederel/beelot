package fr.beelot.application.privacy;

import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Clock;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SecurityEventsTest {

    @Test
    void recordingFailureDoesNotThrow() {
        JdbcClient jdbc = mock(JdbcClient.class);
        when(jdbc.sql(anyString())).thenThrow(new IllegalStateException("database down"));
        SecurityEvents events = new SecurityEvents(jdbc, Clock.systemUTC(), 100);

        assertThatCode(() -> events.record(Type.SIGN_IN, Outcome.SUCCESS,
                UUID.randomUUID(), "127.0.0.1")).doesNotThrowAnyException();
    }

    /** Anyone can make a sign-in fail: such events stop at the limit, so they cannot fill the table. */
    @Test
    void anonymousEventsStopAtTheLimitPerIp() {
        JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
        SecurityEvents events = new SecurityEvents(jdbc, Clock.systemUTC(), 3);

        for (int i = 0; i < 5; i++) events.record(Type.SIGN_IN, Outcome.FAILURE, null, "10.0.0.1");
        events.record(Type.RATE_LIMITED, Outcome.REFUSED, null, "10.0.0.1");
        events.record(Type.SIGN_UP, Outcome.FAILURE, null, "10.0.0.2");

        verify(jdbc, times(4)).sql(anyString());
    }

    @Test
    void accountEventsAndDeletionsAreNeverLimited() {
        JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
        SecurityEvents events = new SecurityEvents(jdbc, Clock.systemUTC(), 1);
        UUID account = UUID.randomUUID();

        for (int i = 0; i < 3; i++) events.record(Type.SIGN_IN, Outcome.SUCCESS, account, "10.0.0.1");
        for (int i = 0; i < 3; i++) events.record(Type.DELETION, Outcome.SUCCESS, null, "10.0.0.1");

        verify(jdbc, times(6)).sql(anyString());
    }
}
