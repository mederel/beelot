package fr.beelot.application.account;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class PasskeyRateLimiterTest {

    private final MutableClock clock = new MutableClock();
    private final PasskeyRateLimiter limiter = new PasskeyRateLimiter(clock, 30);

    @Test
    void allowsUpToTheLimitPerIp() {
        for (int i = 0; i < 30; i++) assertThat(limiter.tryAcquire("10.0.0.1")).isTrue();
        assertThat(limiter.tryAcquire("10.0.0.1")).isFalse();
    }

    @Test
    void anotherIpIsNotAffected() {
        for (int i = 0; i < 31; i++) limiter.tryAcquire("10.0.0.1");

        assertThat(limiter.tryAcquire("10.0.0.2")).isTrue();
    }

    @Test
    void windowResetsAfterAnHour() {
        for (int i = 0; i < 30; i++) limiter.tryAcquire("10.0.0.1");
        assertThat(limiter.tryAcquire("10.0.0.1")).isFalse();

        clock.advance(Duration.ofHours(1));

        assertThat(limiter.tryAcquire("10.0.0.1")).isTrue();
    }

    @Test
    void refusedRequestsDoNotCount() {
        for (int i = 0; i < 30; i++) limiter.tryAcquire("10.0.0.1");
        for (int i = 0; i < 20; i++) assertThat(limiter.tryAcquire("10.0.0.1")).isFalse();

        clock.advance(Duration.ofHours(1));

        for (int i = 0; i < 30; i++) assertThat(limiter.tryAcquire("10.0.0.1")).isTrue();
        assertThat(limiter.tryAcquire("10.0.0.1")).isFalse();
    }

    @Test
    void boundsTrackIps() {
        PasskeyRateLimiter generous = new PasskeyRateLimiter(clock, 3);
        for (int i = 0; i < 50_000; i++) assertThat(generous.tryAcquire("ip" + i)).isTrue();

        assertThat(generous.tryAcquire("newcomer")).isFalse();
        assertThat(generous.tryAcquire("ip0")).isTrue();

        clock.advance(Duration.ofHours(1));

        assertThat(generous.tryAcquire("newcomer")).isTrue();
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-01-01T00:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
