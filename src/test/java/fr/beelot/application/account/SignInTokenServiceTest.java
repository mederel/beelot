package fr.beelot.application.account;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.ott.DefaultOneTimeToken;
import org.springframework.security.authentication.ott.GenerateOneTimeTokenRequest;
import org.springframework.security.authentication.ott.OneTimeToken;
import org.springframework.security.authentication.ott.OneTimeTokenAuthenticationToken;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Sign-in tokens are stored only as hashes, work once, and expire. */
@SpringBootTest
@Testcontainers
class SignInTokenServiceTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @TestConfiguration
    static class ClockConfiguration {
        @Bean
        @Primary
        MovableClock movableClock() {
            return new MovableClock();
        }
    }

    @Autowired
    private SignInTokenService tokens;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private MovableClock clock;

    @BeforeEach
    void emptyTheTable() {
        jdbc.sql("DELETE FROM sign_in_token").update();
    }

    @Test
    void storesOnlyTheHash() {
        OneTimeToken token = tokens.generate(new GenerateOneTimeTokenRequest("jane@example.com"));

        var rows = jdbc.sql("SELECT token_hash, email FROM sign_in_token").query().listOfRows();
        assertEquals(1, rows.size());
        assertEquals(Tokens.hash(token.getTokenValue()), rows.get(0).get("token_hash"));
        assertNotEquals(token.getTokenValue(), rows.get(0).get("token_hash"));
        assertEquals("jane@example.com", rows.get(0).get("email"));
        assertTrue(token.getTokenValue().matches("[A-Za-z0-9_-]{43}"));
        assertEquals(clock.instant().plus(Duration.ofMinutes(15)), token.getExpiresAt());
    }

    @Test
    void aTokenWorksOnce() {
        OneTimeToken token = tokens.generate(new GenerateOneTimeTokenRequest("jane@example.com"));

        OneTimeToken first = tokens.consume(new OneTimeTokenAuthenticationToken(token.getTokenValue()));
        assertNotNull(first);
        assertEquals("jane@example.com", first.getUsername());
        assertNull(tokens.consume(new OneTimeTokenAuthenticationToken(token.getTokenValue())));
    }

    @Test
    void anExpiredTokenIsRefused() {
        OneTimeToken token = tokens.generate(new GenerateOneTimeTokenRequest("jane@example.com"));
        clock.advance(Duration.ofMinutes(15).plusSeconds(1));

        assertNull(tokens.consume(new OneTimeTokenAuthenticationToken(token.getTokenValue())));
        assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM sign_in_token").query(Integer.class).single());
    }

    @Test
    void anUnknownTokenIsRefused() {
        assertNull(tokens.consume(new OneTimeTokenAuthenticationToken("nope")));
    }

    @Test
    void purgeDeletesOnlyRowsExpiredForADay() {
        insert("old", clock.instant().minus(Duration.ofHours(25)));
        insert("recent", clock.instant().minus(Duration.ofHours(1)));

        assertEquals(1, tokens.purgeExpired());
        assertEquals("recent", jdbc.sql("SELECT token_hash FROM sign_in_token").query(String.class).single());
    }

    private void insert(String hash, Instant expiresAt) {
        jdbc.sql("INSERT INTO sign_in_token (token_hash, email, expires_at) VALUES (?, ?, ?)")
                .params(hash, "jane@example.com", LocalDateTime.ofInstant(expiresAt, ZoneOffset.UTC))
                .update();
    }

    static final class MovableClock extends Clock {
        private volatile Instant now = Instant.parse("2026-10-10T12:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
