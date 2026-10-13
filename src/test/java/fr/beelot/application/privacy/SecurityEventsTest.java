package fr.beelot.application.privacy;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Clock;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SecurityEventsTest {

    @Test
    void recordingFailureDoesNotThrow() {
        JdbcClient jdbc = mock(JdbcClient.class);
        when(jdbc.sql(anyString())).thenThrow(new IllegalStateException("database down"));
        SecurityEvents events = new SecurityEvents(jdbc, Clock.systemUTC());

        assertThatCode(() -> events.record(SecurityEvents.Type.SIGN_IN, SecurityEvents.Outcome.SUCCESS,
                UUID.randomUUID(), "127.0.0.1")).doesNotThrowAnyException();
    }
}
